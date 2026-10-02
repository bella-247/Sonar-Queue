import type { AgentState, TrackedIssue } from '../types.js';
import { saveState } from '../state.js';

export async function handleWontFix(
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
    console.error('Error: Reason required for wont-fix.');
    process.exitCode = 1;
    return;
  }

  const issue = stateMap.get(key)!;
  issue.status = 'wont-fix';
  issue.notes = reason;
  stateMap.set(key, issue);

  state.issues = Object.fromEntries(stateMap);
  await saveState(state);
  console.log(`Wont-fix: ${key}`);
}
