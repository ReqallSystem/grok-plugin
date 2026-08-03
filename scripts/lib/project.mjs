import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

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
    const url = new URL(trimmed);
    return url.pathname.replace(/^\//, '');
  } catch {
    return '';
  }
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
  return basename(cwd);
}
