import fs from 'fs/promises';
import type { SonarIssuesPayload, TrackedIssue } from '../types.js';
import { calculateSummary } from '../state.js';
import { ISSUES_FILE } from '../utils.js';

export async function handleStatus(
  stateMap: Map<string, TrackedIssue>,
  args: string[] = []
): Promise<void> {
  let fileScope: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' || args[i] === '--path' || args[i] === '-f') {
      fileScope = args[++i];
    }
  }

  let scanStats: {
    openScanIssues: number;
    closedScanIssues: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  } | null = null;

  try {
    const raw = await fs.readFile(ISSUES_FILE, 'utf-8');
    const payload: SonarIssuesPayload = JSON.parse(raw);
    let openIssues = payload.issues.filter(
      (i) => i.status !== 'CLOSED' && i.resolution !== 'FIXED'
    );
    let closedIssues = payload.issues.filter(
      (i) => i.status === 'CLOSED' || i.resolution === 'FIXED'
    );

    if (fileScope) {
      const lower = fileScope.toLowerCase();
      openIssues = openIssues.filter((i) => (i.component || '').toLowerCase().includes(lower));
      closedIssues = closedIssues.filter((i) => (i.component || '').toLowerCase().includes(lower));
    }

    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const i of openIssues) {
      bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
      byType[i.type] = (byType[i.type] || 0) + 1;
    }

    scanStats = {
      openScanIssues: openIssues.length,
      closedScanIssues: closedIssues.length,
      bySeverity,
      byType,
    };
  } catch {
    // issues.json may not be available yet
  }

  const scopeLabel = fileScope ? ` [${fileScope}]` : '';

  if (scanStats) {
    const sev = Object.entries(scanStats.bySeverity)
      .map(([k, v]) => `${v} ${k.toLowerCase()}`)
      .join(', ');
    const typ = Object.entries(scanStats.byType)
      .map(([k, v]) => `${v} ${k.toLowerCase()}`)
      .join(', ');
    console.log(
      `Scan${scopeLabel}: ${scanStats.openScanIssues} open (${sev || 'none'} | ${typ || 'none'}), ${scanStats.closedScanIssues} closed`
    );
  } else {
    console.log(`Scan${scopeLabel}: No issues.json found`);
  }

  let issuesToSummarize = Array.from(stateMap.values());
  if (fileScope) {
    const lower = fileScope.toLowerCase();
    issuesToSummarize = issuesToSummarize.filter((i) =>
      (i.file || i.component || '').toLowerCase().includes(lower)
    );
  }

  const s = calculateSummary(issuesToSummarize);
  console.log(
    `Queue${scopeLabel}: ${s.pending} pending, ${s.investigating} investigating, ${s.fixed} fixed, ${s.verified} verified, ${s.wontFix} wont-fix, ${s.falsePositive} fp, ${s.deferred} deferred (${s.totalTracked} total)`
  );
}
