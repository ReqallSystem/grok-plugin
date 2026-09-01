import { execFileSync } from 'node:child_process';
import os from 'node:os';

function safeExec(args, cwd = process.cwd()) {
  try {
    return execFileSync(args[0], args.slice(1), {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function normalizeRemote(remoteUrl) {
  if (!remoteUrl) return '';
  const trimmed = remoteUrl.replace(/\.git$/, '');
  const sshMatch = trimmed.match(/[:/]([^/:]+\/[^/]+)$/);
  if (sshMatch) return sshMatch[1];
  try {
    // Last two path segments — parity with the server's normalization and
    // dup_key (gitlab subgroups: grp/sub/proj -> sub/proj).
    const segs = new URL(trimmed).pathname.split('/').filter(Boolean);
    if (segs.length >= 2) return segs.slice(-2).join('/');
    return segs[0] ?? '';
  } catch {
    return '';
  }
}

/**
 * The reserved machine project for this box and OS user:
 * `.machine/<hostname>/<os-user>`. REQALL_MACHINE_NAME overrides the hostname
 * segment (CI/containers with ephemeral hostnames). The server auto-creates
 * `.user` and links it parent-> this project on first upsert.
 */
export function machineProjectName(env = process.env) {
  const clean = (seg) => String(seg ?? '').trim().replace(/[\\/\s]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
  const host = env.REQALL_MACHINE_NAME && env.REQALL_MACHINE_NAME.trim()
    ? env.REQALL_MACHINE_NAME.trim()
    : os.hostname().split('.')[0];
  let user = 'unknown';
  try {
    user = os.userInfo().username || 'unknown';
  } catch {
    // no passwd entry
  }
  return `.machine/${clean(host).toLowerCase()}/${clean(user)}`;
}

/**
 * Resolve project name: REQALL_PROJECT_NAME → git origin org/repo → cwd basename.
 */
export function resolveProjectName(cwd = process.cwd(), env = process.env) {
  if (env.REQALL_PROJECT_NAME && env.REQALL_PROJECT_NAME.trim()) {
    return env.REQALL_PROJECT_NAME.trim();
  }
  const remoteUrl = safeExec(['git', 'remote', 'get-url', 'origin'], cwd);
  const normalized = normalizeRemote(remoteUrl);
  if (normalized) return normalized;
  // Non-repo sessions are machine memory — never the directory basename
  // (which minted junk projects like "ubuntu" or UUID worktree names).
  return machineProjectName(env);
}
