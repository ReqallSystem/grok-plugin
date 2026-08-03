#!/usr/bin/env node
/**
 * Reqall lifecycle hooks for Grok Build.
 *
 * Mirrors the Claude plugin intent:
 *   SessionStart / UserPromptSubmit / PreToolUse → retrieve context
 *   PostToolUse / Stop → document / persist records
 *
 * Grok-specific notes:
 * - Prefer structured JSON (hookSpecificOutput.additionalContext, decision:block).
 * - Fail-open always (never trap the agent on hook errors).
 * - Accept camelCase (Grok) and snake_case (Claude-compat) stdin envelopes.
 * - Stop blocks once per turn so the agent must run reqall:persist.
 */

import { readFileSync } from 'node:fs';
import { resolveProjectName } from './lib/project.mjs';
import {
  formatRecall,
  listOpenRecords,
  parseProjectId,
  search,
  upsertProject,
} from './lib/mcp.mjs';
import { loadSession, markerSeen, saveSession } from './lib/state.mjs';

const STOP_DIRECTIVE = [
  '[reqall] MANDATORY persistence before ending this turn.',
  'Invoke the reqall:persist skill (or equivalent MCP flow):',
  '(1) reqall:upsert_project with the current project name,',
  '(2) for each distinct meaningful work item, reqall:upsert_record with appropriate kind/status/title/body,',
  '(3) reqall:upsert_link for related records when clear,',
  '(4) reqall:list_records to verify.',
  'Skip only pure Q&A, read-only inspection, or trivial mechanical ops.',
  'If Reqall is unavailable, continue and disclose that persistence did not run.',
].join(' ');

const DOCUMENT_DIRECTIVE = [
  '[reqall] Meaningful tool use completed.',
  'If the action was non-trivial, document it now via reqall:document / reqall:upsert_record',
  '(upsert project → search related → upsert record → link). Skip read-only / no-op / formatting-only.',
].join(' ');

// ── envelope helpers ──────────────────────────────────────────────────

function asString(value) {
  return typeof value === 'string' ? value : undefined;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalize(payload) {
  const toolName = asString(payload.tool_name) ?? asString(payload.toolName);
  const toolInput = payload.tool_input ?? payload.toolInput;
  const toolResult = payload.tool_result ?? payload.toolResult ?? payload.tool_response;
  const sessionId = asString(payload.session_id) ?? asString(payload.sessionId) ?? '';
  const promptId = asString(payload.prompt_id)
    ?? asString(payload.promptId)
    ?? asString(payload.turn_id)
    ?? asString(payload.turnId)
    ?? '';
  const cwd = asString(payload.cwd)
    ?? asString(payload.workspaceRoot)
    ?? asString(payload.workspace_root)
    ?? process.cwd();
  const prompt = asString(payload.prompt)
    ?? asString(payload.user_input)
    ?? asString(payload.userInput)
    ?? asString(payload.userPrompt)
    ?? '';
  const hookEvent = asString(payload.hook_event_name)
    ?? asString(payload.hookEventName)
    ?? process.env.GROK_HOOK_EVENT
    ?? '';
  const stopHookActive = payload.stop_hook_active === true || payload.stopHookActive === true;
  const reason = asString(payload.reason) ?? '';

  return {
    ...payload,
    tool_name: toolName || '',
    tool_input: asRecord(toolInput),
    tool_result: toolResult,
    session_id: sessionId,
    prompt_id: promptId,
    cwd,
    prompt,
    hook_event_name: hookEvent,
    stop_hook_active: stopHookActive,
    reason,
  };
}

function readInput() {
  try {
    const raw = readFileSync(0, 'utf8');
    if (!raw.trim()) return normalize({});
    return normalize(JSON.parse(raw));
  } catch {
    return normalize({});
  }
}

function out(value) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    process.stdout.write(value);
    if (!value.endsWith('\n')) process.stdout.write('\n');
    return;
  }
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function additionalContext(eventName, text) {
  return {
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: text,
    },
  };
}

function eventName(input) {
  const raw = String(input.hook_event_name || '').trim();
  if (!raw) return '';
  // Normalize: pre_tool_use / PreToolUse / preToolUse → PreToolUse-ish key
  const compact = raw.replace(/[_-]/g, '').toLowerCase();
  const map = {
    sessionstart: 'SessionStart',
    userpromptsubmit: 'UserPromptSubmit',
    pretooluse: 'PreToolUse',
    posttooluse: 'PostToolUse',
    posttoolusefailure: 'PostToolUseFailure',
    stop: 'Stop',
    subagentstart: 'SubagentStart',
    subagentstop: 'SubagentStop',
    subagentend: 'SubagentStop',
    sessionend: 'SessionEnd',
  };
  return map[compact] || raw;
}

// ── classification ────────────────────────────────────────────────────

function isTrivialPrompt(prompt) {
  const value = String(prompt || '').trim();
  if (!value) return true;
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|yo|sup)[!.?\s]*$/i.test(value)) return true;
  return false;
}

function isNonTrivialPrompt(prompt) {
  if (isTrivialPrompt(prompt)) return false;
  return /\b(implement|update|change|edit|fix|debug|bug|refactor|migrat|architect|design|create|add|remove|test|build|review|audit|inspect|assess|examine|research|analy[sz]e|investigate|diagnose|release|deploy|document|wire|hook|plugin)\w*\b/i.test(
    prompt,
  ) || prompt.length > 40;
}

function deriveToolQuery(toolName, toolInput) {
  const input = asRecord(toolInput);
  switch (toolName) {
    case 'Bash':
    case 'run_terminal_command':
    case 'apply_patch':
      return (asString(input.command) || '').trim();
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
    case 'search_replace':
    case 'write':
    case 'read_file':
    case 'Read':
      return (
        asString(input.file_path)
        || asString(input.target_file)
        || asString(input.notebook_path)
        || asString(input.path)
        || ''
      ).trim();
    default:
      return (
        asString(input.file_path)
        || asString(input.target_file)
        || asString(input.command)
        || ''
      ).trim();
  }
}

function isMutatingTool(toolName, toolInput) {
  const name = String(toolName || '');
  if (/^(search_replace|Write|Edit|MultiEdit|NotebookEdit|write)$/i.test(name)) return true;
  if (/^(Bash|run_terminal_command)$/i.test(name)) {
    const cmd = String(asRecord(toolInput).command || '');
    // Treat most shell as potentially mutating; skip pure inspection.
    if (!cmd.trim()) return false;
    if (/^(ls|dir|pwd|cat|type|Get-Content|Get-ChildItem|git\s+(status|diff|log|show|branch)|echo|which|where)\b/i.test(cmd.trim())) {
      return false;
    }
    return true;
  }
  return false;
}

// ── context retrieval ─────────────────────────────────────────────────

async function retrieveContext(projectName, query) {
  const projectRes = await upsertProject(projectName);
  const projectId = parseProjectId(projectRes.data) ?? parseProjectId(projectRes.text);
  const searchRes = await search(query || projectName, projectName, 5);
  const openRes = projectId ? await listOpenRecords(projectId) : { ok: false, error: 'no_project_id' };
  return {
    projectId,
    text: formatRecall(projectName, searchRes, openRes),
    searchOk: Boolean(searchRes.ok),
    projectOk: Boolean(projectRes.ok),
  };
}

// ── handlers ──────────────────────────────────────────────────────────

async function handleSessionStart(input) {
  const project = resolveProjectName(input.cwd);
  // Warm project; no model injection required on SessionStart.
  await upsertProject(project);
  const state = loadSession(input.session_id);
  saveSession(input.session_id, {
    ...state,
    project,
    contextLoaded: false,
    dirty: false,
    mutations: 0,
    stopBlocked: false,
  });
  return additionalContext(
    'SessionStart',
    `Reqall memory autopilot is active for project "${project}". On non-trivial work, retrieve context before mutations and persist outcomes before the turn ends.`,
  );
}

async function handleUserPromptSubmit(input) {
  const project = resolveProjectName(input.cwd);
  const prompt = input.prompt || '';
  const trivial = isTrivialPrompt(prompt);
  const state = loadSession(input.session_id);

  if (trivial) {
    saveSession(input.session_id, {
      ...state,
      project,
      contextLoaded: true,
      dirty: false,
      lastQuery: prompt,
    });
    return null;
  }

  const query = prompt.slice(0, 500) || project;
  const recall = await retrieveContext(project, query);
  saveSession(input.session_id, {
    ...state,
    project,
    projectId: recall.projectId,
    contextLoaded: true,
    dirty: false,
    mutations: 0,
    stopBlocked: false,
    lastQuery: query,
  });

  const directive = [
    recall.text,
    '',
    `[reqall] Project name for MCP tools: "${project}".`,
    'If more detail is needed, call reqall:context / reqall:search / reqall:list_records before editing.',
  ].join('\n');

  return additionalContext('UserPromptSubmit', directive);
}

async function handlePreToolUse(input) {
  const toolName = input.tool_name;
  const query = deriveToolQuery(toolName, input.tool_input);
  if (!query) return null;

  // Only spend budget on mutating / path-bearing tools.
  const mutating = isMutatingTool(toolName, input.tool_input);
  const looksLikePath = /[\\/]|\.\w{1,8}$/.test(query);
  if (!mutating && !looksLikePath) return null;

  const project = resolveProjectName(input.cwd);
  const state = loadSession(input.session_id);

  // Dedupe identical pre-tool queries within a session.
  const dedupeKey = `${input.session_id}__pre__${query}`;
  if (input.session_id && markerSeen(dedupeKey)) {
    return null;
  }

  const searchRes = await search(query, project, 3);
  if (!searchRes.ok && !searchRes.text) {
    // Still remind the agent if we couldn't fetch.
    if (mutating) {
      return additionalContext(
        'PreToolUse',
        `[reqall] Before modifying "${query}", call reqall:search with query="${query}" and project_name="${project}" for related specs/issues/decisions.`,
      );
    }
    return null;
  }

  const text = formatRecall(project, searchRes, null);
  if (!state.contextLoaded) {
    saveSession(input.session_id, { ...state, project, contextLoaded: true });
  }

  return additionalContext(
    'PreToolUse',
    `${text}\n\n[reqall] Path-focused recall for upcoming tool (${toolName}): ${query}`,
  );
}

async function handlePostToolUse(input) {
  const mutating = isMutatingTool(input.tool_name, input.tool_input);
  if (!mutating) return null;

  const state = loadSession(input.session_id);
  const project = state.project || resolveProjectName(input.cwd);
  saveSession(input.session_id, {
    ...state,
    project,
    dirty: true,
    mutations: (state.mutations || 0) + 1,
  });

  const summary = deriveToolQuery(input.tool_name, input.tool_input) || input.tool_name;
  return additionalContext(
    'PostToolUse',
    `${DOCUMENT_DIRECTIVE} Project="${project}". Tool=${input.tool_name}. Target=${summary}.`,
  );
}

async function handleSubagentStop(input) {
  const project = resolveProjectName(input.cwd);
  const agentType = asString(input.agent_type) || asString(input.agentType) || '';
  if (/plan/i.test(agentType)) {
    return additionalContext(
      'SubagentStop',
      `[reqall] Planning subagent finished. Save the plan: reqall:upsert_project name="${project}", then reqall:upsert_record kind=spec status=open with the plan title and full body.`,
    );
  }
  return additionalContext(
    'SubagentStop',
    '[reqall] Subagent completed. If it produced significant work products, note them for root-turn persistence.',
  );
}

async function handleStop(input) {
  // Observe-only session-end Stop — do not gate.
  if (input.reason === 'channel_closed' || input.reason === 'shutdown') {
    return null;
  }

  const state = loadSession(input.session_id);
  const project = state.project || resolveProjectName(input.cwd);
  const nonTrivial = state.dirty
    || state.mutations > 0
    || isNonTrivialPrompt(state.lastQuery || '');

  // Nothing to persist → allow stop.
  if (!nonTrivial) return null;

  // Host already continuing from a previous block, or we already blocked once.
  if (input.stop_hook_active || state.stopBlocked) {
    return null;
  }

  const turnKey = `${input.session_id}__stop__${input.prompt_id || 'turn'}`;
  if (markerSeen(turnKey)) {
    return null;
  }

  saveSession(input.session_id, { ...state, project, stopBlocked: true });

  return {
    decision: 'block',
    reason: `${STOP_DIRECTIVE} project_name="${project}".`,
  };
}

// ── main ──────────────────────────────────────────────────────────────

async function main() {
  const input = readInput();
  const event = eventName(input);

  try {
    let result = null;
    switch (event) {
      case 'SessionStart':
        result = await handleSessionStart(input);
        break;
      case 'UserPromptSubmit':
        result = await handleUserPromptSubmit(input);
        break;
      case 'PreToolUse':
        result = await handlePreToolUse(input);
        break;
      case 'PostToolUse':
        result = await handlePostToolUse(input);
        break;
      case 'SubagentStop':
        result = await handleSubagentStop(input);
        break;
      case 'Stop':
        result = await handleStop(input);
        break;
      default:
        // Unknown / empty event: no-op.
        result = null;
    }
    if (result) out(result);
  } catch (err) {
    // Fail-open: never block the agent because the hook crashed.
    console.error(`[reqall-hook] ${err?.message || err}`);
  }
  // Hard-exit so undici keep-alive sockets cannot trip Windows UV assertions
  // or keep the hook process alive after the host has already read stdout.
  process.exit(0);
}

await main();
