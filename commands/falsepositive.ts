import type { AgentState, TrackedIssue } from '../types.js';
import { saveState } from '../state.js';

export async function handleFalsePositive(
  state: AgentState,
  stateMap: Map<string, TrackedIssue>,
  args: string[]
): Promise<void> {
  const key = args[0];
  const reason = args.slice(1).join(' ').trim();
  if (!key || !stateMap.has(key)) {
    console.error(`Error: Issue key "${key}" not found.`);
    process.exit(1);
  }
  if (!reason) {
    console.error('Error: Reason required for false-positive.');
    process.exit(1);
  }

  const issue = stateMap.get(key)!;
  issue.status = 'false-positive';
  issue.notes = reason;
  stateMap.set(key, issue);

  state.issues = Object.fromEntries(stateMap);
  await saveState(state);
  console.log(`False-positive: ${key}`);
}
