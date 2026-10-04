import { resolveProjectBinding } from './project-policy.mjs';
export { machineProjectName, extractProjectHint as promptProject } from './project-policy.mjs';

export function resolveProjectName(cwd = process.cwd(), env = process.env, prompt = '', selected = '') {
  return resolveProjectBinding(cwd, env, prompt, selected).name;
}
