import type { AgentState, SonarIssue, TrackedIssue } from '../types.js';
import { saveState } from '../state.js';
import { fetchIssuesFromSonar } from './export.js';

interface SyncCounts {
  newCount: number;
  regressionCount: number;
}

function syncOpenIssues(
  openScanMap: Map<string, SonarIssue>,
  stateMap: Map<string, TrackedIssue>,
  now: string
): SyncCounts {
  let newCount = 0;
  let regressionCount = 0;

  for (const [key, scanIssue] of openScanMap.entries()) {
    const existing = stateMap.get(key);
    if (!existing) {
      stateMap.set(key, {
        issueKey: key,
        rule: scanIssue.rule,
        severity: scanIssue.severity,
        type: scanIssue.type,
        component: scanIssue.file,
        file: scanIssue.file,
        line: scanIssue.line,
        message: scanIssue.message,
        status: 'pending',
        firstSeen: now,
        lastSeen: now,
        attempts: 0,
      });
      newCount++;
    } else {
      existing.lastSeen = now;
      existing.line = scanIssue.line;
      existing.file = scanIssue.file;
      existing.component = scanIssue.file;
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

  return { newCount, regressionCount };
}

function reconcileStateIssues(
  stateMap: Map<string, TrackedIssue>,
  openScanMap: Map<string, SonarIssue>,
  now: string
): number {
  let verifiedCount = 0;

  for (const [key, tracked] of stateMap.entries()) {
    if (tracked.status === 'fixed') {
      if (!openScanMap.has(key)) {
        tracked.status = 'verified';
        tracked.verifiedAt = now;
        tracked.lastSeen = now;
        verifiedCount++;
        stateMap.set(key, tracked);
      }
    } else if ((tracked.status === 'pending' || tracked.status === 'investigating') && !openScanMap.has(key)) {
      tracked.notes = `Disappeared from scan (removed/excluded). ${tracked.notes || ''}`.trim();
      stateMap.set(key, tracked);
    }
  }

  return verifiedCount;
}

export async function handleSync(
  state: AgentState,
  stateMap: Map<string, TrackedIssue>
): Promise<void> {
  const issues: SonarIssue[] = await fetchIssuesFromSonar();
  const now = new Date().toISOString();

  const openScanIssues = issues.filter((i: SonarIssue) => i.status !== 'CLOSED' && i.resolution !== 'FIXED');
  const openScanMap = new Map<string, SonarIssue>(openScanIssues.map((i: SonarIssue) => [i.key, i]));

  const { newCount, regressionCount } = syncOpenIssues(openScanMap, stateMap, now);
  const verifiedCount = reconcileStateIssues(stateMap, openScanMap, now);

  state.issues = Object.fromEntries(stateMap);
  await saveState(state);

  const regressionNote = regressionCount > 0 ? `, ${regressionCount} reopened` : '';
  console.log(`Synced: ${newCount} new, ${verifiedCount} verified${regressionNote}`);
}