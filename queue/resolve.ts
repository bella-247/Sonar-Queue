import type { AgentState, TrackedIssue } from '../types.js';
import { saveState } from '../state.js';

export async function handleResolve(
  state: AgentState,
  stateMap: Map<string, TrackedIssue>,
  args: string[]
): Promise<void> {
  const key = args[0];
  const notes = args.slice(1).join(' ').trim();
  if (!key || !stateMap.has(key)) {
    console.error(`Error: Issue key "${key}" not found.`);
    process.exitCode = 1;
    return;
  }

  const now = new Date().toISOString();
  const issue = stateMap.get(key)!;
  issue.status = 'fixed';
  issue.fixedAt = now;
  if (notes) {
    issue.notes = notes;
  }
  stateMap.set(key, issue);

  state.issues = Object.fromEntries(stateMap);
  await saveState(state);
  console.log(`Resolved: ${key} (awaiting scan)`);
}
