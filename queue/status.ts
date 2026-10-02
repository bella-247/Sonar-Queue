import type { TrackedIssue } from '../types.js';
import { calculateSummary } from '../state.js';

export function handleStatus(
  stateMap: Map<string, TrackedIssue>,
  args: string[] = []
): void {
  let fileScope: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' || args[i] === '--path' || args[i] === '-f') {
      fileScope = args[++i];
    }
  }

  let issues = Array.from(stateMap.values());
  if (fileScope) {
    const lower = fileScope.toLowerCase();
    issues = issues.filter((i) =>
      (i.file || i.component || '').toLowerCase().includes(lower)
    );
  }

  const scopeLabel = fileScope ? ` [${fileScope}]` : '';

  if (issues.length === 0) {
    console.log(`Queue${scopeLabel}: No issues tracked. Run: sonar-queue scan && sonar-queue sync`);
    return;
  }

  const activeIssues = issues.filter(
    (i) => i.status === 'pending' || i.status === 'investigating' || i.status === 'fixed'
  );
  const verifiedIssues = issues.filter((i) => i.status === 'verified');

  const bySeverity: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const i of activeIssues) {
    bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
    byType[i.type] = (byType[i.type] || 0) + 1;
  }

  const sev = Object.entries(bySeverity)
    .map(([k, v]) => `${v} ${k.toLowerCase()}`)
    .join(', ');
  const typ = Object.entries(byType)
    .map(([k, v]) => `${v} ${k.toLowerCase()}`)
    .join(', ');

  console.log(
    `Issues${scopeLabel}: ${activeIssues.length} active (${sev || 'none'} | ${typ || 'none'}), ${verifiedIssues.length} verified`
  );

  const s = calculateSummary(issues);
  console.log(
    `Queue${scopeLabel}:  ${s.pending} pending, ${s.investigating} investigating, ${s.fixed} fixed, ${s.verified} verified, ${s.wontFix} wont-fix, ${s.falsePositive} fp, ${s.deferred} deferred (${s.totalTracked} total)`
  );
}
