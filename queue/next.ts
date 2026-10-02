import type { AgentState, TrackedIssue } from '../types.js';
import { saveState } from '../state.js';
import { compareIssuesPriority } from '../utils/priority.js';

export interface NextFilterOptions {
  count: number;
  file?: string;
  rule?: string;
  severity?: string[];
  type?: string;
}

export function parseFilterOptions(args: string[]): NextFilterOptions {
  let count = 5;
  let file: string | undefined;
  let rule: string | undefined;
  let severity: string[] | undefined;
  let type: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '--path' || arg === '-f') {
      file = args[++i];
    } else if (arg === '--rule' || arg === '-r') {
      rule = args[++i];
    } else if (arg === '--severity' || arg === '-s') {
      severity = args[++i]?.split(',').map((s) => s.trim().toUpperCase());
    } else if (arg === '--type' || arg === '-t') {
      type = args[++i]?.toUpperCase();
    } else if (/^\d+$/.test(arg)) {
      count = Number.parseInt(arg, 10);
    }
  }

  return { count, file, rule, severity, type };
}

export function matchesFilter(issue: TrackedIssue, filter: NextFilterOptions): boolean {
  if (filter.file && !issue.file.toLowerCase().includes(filter.file.toLowerCase())) {
    return false;
  }
  if (filter.rule && !issue.rule.toLowerCase().includes(filter.rule.toLowerCase())) {
    return false;
  }
  if (filter.severity && !filter.severity.includes(issue.severity.toUpperCase())) {
    return false;
  }
  if (filter.type && issue.type.toUpperCase() !== filter.type) {
    return false;
  }
  return true;
}

export function handleNext(stateMap: Map<string, TrackedIssue>, args: string[]): void {
  const filter = parseFilterOptions(args);
  const pendingIssues = Array.from(stateMap.values())
    .filter((i) => i.status === 'pending' && matchesFilter(i, filter))
    .sort(compareIssuesPriority)
    .slice(0, filter.count);

  if (pendingIssues.length === 0) {
    const scopeMsg = filter.file ? ` matching "${filter.file}"` : '';
    console.log(`No pending issues${scopeMsg}.`);
    return;
  }

  for (const issue of pendingIssues) {
    const file = issue.file;
    const line = issue.line ?? 'N/A';
    const loc = `${file}:${line}`;
    const attemptInfo = issue.attempts > 0 ? ` (attempt #${issue.attempts})` : '';
    console.log(`[${issue.issueKey}] ${issue.severity} ${issue.type} | ${loc} | ${issue.rule}${attemptInfo}`);
    console.log(`  ${issue.message}`);
  }
}

export async function handleClaim(
  state: AgentState,
  stateMap: Map<string, TrackedIssue>,
  args: string[]
): Promise<void> {
  const key = args[0];
  if (!key || !stateMap.has(key)) {
    console.error(`Error: Issue key "${key}" not found.`);
    process.exitCode = 1;
    return;
  }

  const now = new Date().toISOString();
  const issue = stateMap.get(key)!;
  issue.status = 'investigating';
  issue.claimedAt = now;
  issue.attempts += 1;
  stateMap.set(key, issue);

  state.issues = Object.fromEntries(stateMap);
  await saveState(state);
  console.log(`Claimed: ${key} (attempt #${issue.attempts})`);
}

export async function handleClaimNext(
  state: AgentState,
  stateMap: Map<string, TrackedIssue>,
  args: string[]
): Promise<void> {
  const filter = parseFilterOptions(args);
  const pendingIssues = Array.from(stateMap.values())
    .filter((i) => i.status === 'pending' && matchesFilter(i, filter))
    .sort(compareIssuesPriority)
    .slice(0, filter.count);

  if (pendingIssues.length === 0) {
    const scopeMsg = filter.file ? ` matching "${filter.file}"` : '';
    console.log(`No pending issues to claim${scopeMsg}.`);
    return;
  }

  const now = new Date().toISOString();
  for (const issue of pendingIssues) {
    issue.status = 'investigating';
    issue.claimedAt = now;
    issue.attempts += 1;
    stateMap.set(issue.issueKey, issue);
  }

  state.issues = Object.fromEntries(stateMap);
  await saveState(state);
  console.log(`Claimed ${pendingIssues.length} issues.`);
}
