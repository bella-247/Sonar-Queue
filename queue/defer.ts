import type { AgentState, TrackedIssue } from '../types.js';
import { saveState } from '../state.js';

export async function handleDefer(
  state: AgentState,
  stateMap: Map<string, TrackedIssue>,
  args: string[]
): Promise<void> {
  const key = args[0];
  const reason = args.slice(1).join(' ').trim();
  if (!key || !stateMap.has(key)) {
    console.error(`Error: Issue key "${key}" not found.`);
    process.exitCode = 1;
    return;
  }
  if (!reason) {
    console.error('Error: Reason required for defer.');
    process.exitCode = 1;
    return;
  }

  const issue = stateMap.get(key)!;
  issue.status = 'deferred';
  issue.notes = reason;
  stateMap.set(key, issue);

  state.issues = Object.fromEntries(stateMap);
  await saveState(state);
  console.log(`Deferred: ${key}`);
}
