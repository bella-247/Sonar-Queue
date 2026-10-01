import type { AgentState, TrackedIssue } from '../types.js';
import { saveState } from '../state.js';

export async function handleReset(
  state: AgentState,
  stateMap: Map<string, TrackedIssue>,
  args: string[]
): Promise<void> {
  const key = args[0];
  if (!key || !stateMap.has(key)) {
    console.error(`Error: Issue key "${key}" not found.`);
    process.exit(1);
  }
  const issue = stateMap.get(key)!;
  issue.status = 'pending';
  issue.claimedAt = undefined;
  issue.fixedAt = undefined;
  stateMap.set(key, issue);

  state.issues = Object.fromEntries(stateMap);
  await saveState(state);
  console.log(`Reset: ${key}`);
}
