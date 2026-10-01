import type { AgentState, SonarIssue, TrackedIssue } from './types.js';
import { loadIssuesPayload, saveState } from './state.js';
import { extractRelativeFile } from './utils.js';

export async function handleSync(
  state: AgentState,
  stateMap: Map<string, TrackedIssue>
): Promise<void> {
  const payload = await loadIssuesPayload();
  const now = new Date().toISOString();
  let newCount = 0;
  let verifiedCount = 0;
  let regressionCount = 0;

  const openScanIssues = payload.issues.filter(
    (i) => i.status !== 'CLOSED' && i.resolution !== 'FIXED'
  );
  const closedScanIssues = payload.issues.filter(
    (i) => i.status === 'CLOSED' || i.resolution === 'FIXED'
  );

  const openScanMap = new Map<string, SonarIssue>(openScanIssues.map((i) => [i.key, i]));
  const closedScanMap = new Map<string, SonarIssue>(closedScanIssues.map((i) => [i.key, i]));

  // 1. Process Open Scan Issues
  for (const [key, scanIssue] of openScanMap.entries()) {
    const file = extractRelativeFile(scanIssue.component);
    const line = scanIssue.line ?? scanIssue.textRange?.startLine;

    if (!stateMap.has(key)) {
      stateMap.set(key, {
        issueKey: key,
        rule: scanIssue.rule,
        severity: scanIssue.severity,
        type: scanIssue.type,
        component: scanIssue.component,
        file,
        line,
        message: scanIssue.message,
        status: 'pending',
        firstSeen: now,
        lastSeen: now,
        attempts: 0,
      });
      newCount++;
    } else {
      const existing = stateMap.get(key)!;
      existing.lastSeen = now;
      existing.line = line;
      existing.file = file;
      existing.component = scanIssue.component;
      existing.message = scanIssue.message;

      if (existing.status === 'fixed') {
        existing.status = 'pending';
        existing.attempts += 1;
        existing.notes = `[Reopened] Attempt #${existing.attempts} failed: still open in scan. ${existing.notes || ''}`.trim();
        regressionCount++;
      }

      stateMap.set(key, existing);
    }
  }

  // 2. Process State Issues for Resolution or Disappearance
  for (const [key, tracked] of stateMap.entries()) {
    if (tracked.status === 'fixed') {
      if (!openScanMap.has(key) || closedScanMap.has(key)) {
        tracked.status = 'verified';
        tracked.verifiedAt = now;
        tracked.lastSeen = now;
        verifiedCount++;
        stateMap.set(key, tracked);
      }
    } else if (tracked.status === 'pending' || tracked.status === 'investigating') {
      if (!openScanMap.has(key)) {
        if (closedScanMap.has(key)) {
          const closed = closedScanMap.get(key)!;
          tracked.notes = `Closed upstream (${closed.resolution || 'CLOSED'}). ${tracked.notes || ''}`.trim();
        } else {
          tracked.notes = `Disappeared from scan (removed/excluded). ${tracked.notes || ''}`.trim();
        }
        stateMap.set(key, tracked);
      }
    }
  }

  state.issues = Object.fromEntries(stateMap);
  await saveState(state);

  const regressionNote = regressionCount > 0 ? `, ${regressionCount} reopened` : '';
  console.log(`Synced: ${newCount} new, ${verifiedCount} verified${regressionNote}`);
}
