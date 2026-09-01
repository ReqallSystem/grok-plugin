import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = join(root, 'scripts', 'reqall-hook.mjs');

function runHook(payload, env = {}) {
  const ownsData = !env.GROK_PLUGIN_DATA;
  const dataDir = env.GROK_PLUGIN_DATA || mkdtempSync(join(tmpdir(), 'reqall-hook-test-'));
  try {
    const result = spawnSync(process.execPath, [hook], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: {
        ...process.env,
        // Force offline / no accidental live calls unless test sets a key.
        REQALL_API_KEY: '',
        REQALL_URL: 'https://www.reqall.net',
        GROK_PLUGIN_ROOT: root,
        ...env,
        GROK_PLUGIN_DATA: dataDir,
      },
      timeout: 15_000,
    });
    return {
      status: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      dataDir,
    };
  } finally {
    if (ownsData) {
      try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

function parseOut(stdout) {
  const line = stdout.trim().split('\n').filter(Boolean).pop();
  if (!line) return null;
  try {
    return JSON.parse(line);
  } catch {
    return { raw: line };
  }
}

describe('reqall-hook', () => {
  it('exits 0 on empty stdin', () => {
    const result = spawnSync(process.execPath, [hook], {
      input: '',
      encoding: 'utf8',
      env: { ...process.env, REQALL_API_KEY: '', GROK_PLUGIN_DATA: mkdtempSync(join(tmpdir(), 'r-')) },
      timeout: 5000,
    });
    assert.equal(result.status, 0);
  });

  it('UserPromptSubmit trivial prompt is silent', () => {
    const { status, stdout } = runHook({
      hookEventName: 'UserPromptSubmit',
      prompt: 'hi',
      sessionId: 'test-trivial',
      cwd: root,
    });
    assert.equal(status, 0);
    assert.equal(stdout.trim(), '');
  });

  it('UserPromptSubmit non-trivial emits additionalContext (offline still instructs)', () => {
    const { status, stdout } = runHook({
      hookEventName: 'UserPromptSubmit',
      prompt: 'implement plugin hook wiring for context and persist',
      sessionId: 'test-ups',
      cwd: root,
    });
    assert.equal(status, 0);
    const json = parseOut(stdout);
    assert.ok(json, 'expected JSON output');
    assert.equal(json.hookSpecificOutput?.hookEventName, 'UserPromptSubmit');
    assert.match(json.hookSpecificOutput?.additionalContext || '', /Reqall/i);
  });

  it('PreToolUse for search_replace emits path context reminder', () => {
    const { status, stdout } = runHook({
      hookEventName: 'PreToolUse',
      toolName: 'search_replace',
      toolInput: { file_path: 'hooks/hooks.json' },
      sessionId: 'test-pre',
      cwd: root,
    });
    assert.equal(status, 0);
    const json = parseOut(stdout);
    assert.ok(json?.hookSpecificOutput?.additionalContext);
    assert.match(json.hookSpecificOutput.additionalContext, /hooks[\\/]hooks\.json|Reqall/i);
  });

  it('PostToolUse marks dirty and Stop blocks once', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'reqall-hook-test-'));
    const env = { GROK_PLUGIN_DATA: dataDir };
    try {
      const post = runHook({
        hookEventName: 'PostToolUse',
        toolName: 'search_replace',
        toolInput: { target_file: 'scripts/reqall-hook.mjs' },
        sessionId: 'test-stop',
        cwd: root,
      }, env);
      assert.equal(post.status, 0);
      const postJson = parseOut(post.stdout);
      assert.ok(postJson?.hookSpecificOutput?.additionalContext);

      const stop1 = runHook({
        hookEventName: 'Stop',
        sessionId: 'test-stop',
        promptId: 'turn-1',
        reason: 'end_turn',
        cwd: root,
      }, env);
      assert.equal(stop1.status, 0);
      const stopJson = parseOut(stop1.stdout);
      assert.equal(stopJson?.decision, 'block');
      assert.match(stopJson?.reason || '', /persist|upsert_record/i);

      const stop2 = runHook({
        hookEventName: 'Stop',
        sessionId: 'test-stop',
        promptId: 'turn-1',
        reason: 'end_turn',
        stopHookActive: true,
        cwd: root,
      }, env);
      assert.equal(stop2.status, 0);
      assert.equal(stop2.stdout.trim(), '', 'second stop should allow');
    } finally {
      try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('Stop allows session-end observe fires', () => {
    const { status, stdout } = runHook({
      hookEventName: 'Stop',
      reason: 'shutdown',
      sessionId: 'test-shutdown',
      cwd: root,
    });
    assert.equal(status, 0);
    assert.equal(stdout.trim(), '');
  });
});

describe('machine project fallback', () => {
  it('non-repo cwd resolves to the machine project', async () => {
    const { resolveProjectName } = await import('../scripts/lib/project.mjs');
    const dir = mkdtempSync(join(tmpdir(), 'reqall-nogit-'));
    try {
      assert.match(resolveProjectName(dir, {}), /^\.machine\/[^/]+\/[^/]+$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('REQALL_MACHINE_NAME overrides the hostname segment', async () => {
    const { machineProjectName } = await import('../scripts/lib/project.mjs');
    assert.match(machineProjectName({ REQALL_MACHINE_NAME: 'CI-Box' }), /^\.machine\/ci-box\/[^/]+$/);
  });
});
