import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

export function stateDir(env = process.env) {
  const pluginData = env.GROK_PLUGIN_DATA
    || env.CLAUDE_PLUGIN_DATA
    || env.PLUGIN_DATA;
  if (typeof pluginData === 'string' && pluginData.trim()) {
    return resolve(pluginData, 'reqall-hooks');
  }
  return join(tmpdir(), 'reqall-grok-hooks');
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function sessionPath(sessionId, env = process.env) {
  const id = (sessionId && String(sessionId).trim()) || 'default';
  return join(stateDir(env), `session-${digest(id)}.json`);
}

export function loadSession(sessionId, env = process.env) {
  try {
    const p = sessionPath(sessionId, env);
    if (!existsSync(p)) return defaultState();
    const data = JSON.parse(readFileSync(p, 'utf8'));
    return { ...defaultState(), ...data };
  } catch {
    return defaultState();
  }
}

function defaultState() {
  return {
    project: '',
    projectId: null,
    contextLoaded: false,
    dirty: false,
    mutations: 0,
    lastQuery: '',
    stopBlocked: false,
    updatedAt: '',
  };
}

export function saveSession(sessionId, state, env = process.env) {
  try {
    const dir = stateDir(env);
    ensureDir(dir);
    const next = { ...state, updatedAt: new Date().toISOString() };
    writeFileSync(sessionPath(sessionId, env), `${JSON.stringify(next, null, 2)}\n`);
    return next;
  } catch {
    return state;
  }
}

/**
 * Once-per-turn marker using exclusive file create.
 * Returns true if already seen (should allow stop).
 */
export function markerSeen(key, env = process.env) {
  try {
    const dir = join(stateDir(env), 'markers');
    ensureDir(dir);
    const file = join(dir, `${digest(key)}.seen`);
    if (existsSync(file)) return true;
    writeFileSync(file, `${new Date().toISOString()}\n`, { flag: 'wx' });
    return false;
  } catch {
    // File exists or write race — treat as already seen (fail open on second).
    return true;
  }
}
