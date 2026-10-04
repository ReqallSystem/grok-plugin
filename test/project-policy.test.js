import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveProjectName } from '../scripts/lib/project.mjs';

test('AGENTS policy matches runtime portable precedence', () => {
  const text = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  const policy = text.slice(text.indexOf('1. Reuse the authoritative'));
  let previous = -1;
  for (const token of ['REQALL_PROJECT_NAME', 'network Git', 'explicitly labelled', '.reqall.yml', 'package.json', 'REQALL_WORKSPACE_ROOT', '.machine/']) {
    const at = policy.indexOf(token);
    assert.ok(at > previous, `missing or out-of-order ${token}`);
    previous = at;
  }
  for (const token of ['.reqall.yaml', '64 KiB', '.user', 'SLEEP', 'OS user', 'no record migration']) assert.ok(policy.includes(token), `missing ${token}`);
});

test('portable metadata and labelled selections follow canonical precedence', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'reqall-policy-'));
  try {
    writeFileSync(join(cwd, '.reqall.yml'), 'project: portable/notes\n');
    assert.equal(resolveProjectName(cwd, {}), 'portable/notes');
    assert.equal(resolveProjectName(cwd, {}, 'fix project: `chosen/notes`'), 'chosen/notes');
    assert.equal(resolveProjectName(cwd, {}, 'continue', 'chosen/notes'), 'chosen/notes');
    assert.equal(resolveProjectName(cwd, { REQALL_PROJECT_NAME: ' env/wins ' }, 'project=x/y', 'chosen/notes'), 'env/wins');
    assert.equal(resolveProjectName(cwd, {}, 'inspect arbitrary/path'), 'portable/notes');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('host lifecycle retains selections, ignores reports, and switches next turn', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'reqall-host-'));
  const data = mkdtempSync(join(tmpdir(), 'reqall-data-'));
  const hook = fileURLToPath(new URL('../scripts/reqall-hook.mjs', import.meta.url));
  const run = (event, prompt = '', env = {}, extra = {}) => {
    const result = spawnSync(process.execPath, [hook], {
      input: JSON.stringify({ hook_event_name: event, session_id: 'selection-session', cwd, prompt, ...extra }),
      encoding: 'utf8', env: { ...process.env, REQALL_PROJECT_NAME: '', REQALL_WORKSPACE_ROOT: '', REQALL_API_KEY: '', PLUGIN_DATA: data, GROK_PLUGIN_DATA: data, ...env },
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    assert.match(run('UserPromptSubmit', 'implement project: chosen/one'), /chosen\/one/);
    assert.match(run('UserPromptSubmit', 'continue implementation'), /chosen\/one/);
    assert.match(run('UserPromptSubmit', '<task-notification><summary>Example project_name=wrong/example</summary></task-notification>'), /chosen\/one/);
    for (const event of ['SessionStart', 'PreToolUse', 'PostToolUse', 'SubagentStop', 'Stop']) {
      assert.match(run(event, '', { REQALL_PROJECT_NAME: 'mid/override' }, { tool_name: 'Write', tool_input: { file_path: 'src/file.js' }, agent_type: 'plan', prompt_id: 'first' }), /chosen\/one/);
    }
    assert.match(run('UserPromptSubmit', 'implement project_name="chosen/two"'), /chosen\/two/);
    assert.match(run('UserPromptSubmit', 'continue implementation', { REQALL_PROJECT_NAME: 'env/wins' }), /env\/wins/);
    assert.match(run('UserPromptSubmit', 'continue implementation'), /chosen\/two/);
  } finally { rmSync(cwd, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); }
});

test('local fallback grammar, workspace boundaries and network origins', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'reqall-grammar-'));
  const child = join(cwd, 'src', 'work');
  mkdirSync(child, { recursive: true });
  const env = { REQALL_WORKSPACE_ROOT: cwd };
  try {
    assert.equal(resolveProjectName(child, env), 'src/work');
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: '@acme/widgets' }));
    assert.equal(resolveProjectName(child, env), 'acme/widgets');
    writeFileSync(join(cwd, '.reqall.yml'), 'project: ../invalid\n');
    assert.equal(resolveProjectName(child, env), 'acme/widgets');
    writeFileSync(join(cwd, '.reqall.yml'), 'project: "portable/notes" # comment\n');
    assert.equal(resolveProjectName(child, env), 'portable/notes');
    const git = (...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
    git('init', '-q'); git('remote', 'add', 'origin', '/local/not-portable.git');
    assert.equal(resolveProjectName(child, env), 'portable/notes');
    git('remote', 'set-url', 'origin', 'https://gitlab.com/group/sub/repo.git/');
    assert.equal(resolveProjectName(child, env, 'project: lower/priority', 'saved/selection'), 'sub/repo');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

test('localhost MCP receives retained and switched turn identities', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'reqall-mcp-project-'));
  const calls = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw); calls.push(body.params);
      const data = body.params.name === 'upsert_project' ? { id: body.params.arguments.name === 'selected/one' ? 11 : 22 } : { records: [], results: [] };
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: JSON.stringify(data) }] } }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const run = payload => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/reqall-hook.mjs', import.meta.url))], {
      env: { ...process.env, REQALL_PROJECT_NAME: '', REQALL_WORKSPACE_ROOT: '', REQALL_API_KEY: 'test-only', REQALL_URL: `http://127.0.0.1:${server.address().port}`, GROK_PLUGIN_DATA: join(cwd, 'data') },
    });
    let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; }); child.stdout.resume();
    child.on('error', reject); child.on('close', code => { try { assert.equal(code, 0, stderr); resolve(); } catch (e) { reject(e); } });
    child.stdin.end(JSON.stringify({ sessionId: 'mcp-selection', cwd, ...payload }));
  });
  try {
    await run({ hookEventName: 'UserPromptSubmit', userInput: 'implement project: selected/one' });
    await run({ hookEventName: 'UserPromptSubmit', userInput: 'continue implementation' });
    await run({ hookEventName: 'PreToolUse', toolName: 'Write', toolInput: { file_path: 'src/index.js' } });
    await run({ hookEventName: 'UserPromptSubmit', userInput: 'implement project=selected/two' });
    await run({ hookEventName: 'PreToolUse', toolName: 'Write', toolInput: { file_path: 'src/index.js' } });
    assert.deepEqual(calls.filter(c => c.name === 'upsert_project').map(c => c.arguments.name), ['selected/one', 'selected/one', 'selected/two']);
    assert.deepEqual(calls.filter(c => c.name === 'search').map(c => c.arguments.project_name), ['selected/one', 'selected/one', 'selected/one', 'selected/two', 'selected/two']);
    assert.deepEqual(calls.filter(c => c.name === 'list_records').map(c => c.arguments.project_id), [11, 11, 22]);
  } finally { await new Promise(resolve => server.close(resolve)); rmSync(cwd, { recursive: true, force: true }); }
});
