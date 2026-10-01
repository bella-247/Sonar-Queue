import fs from 'fs/promises';
import path from 'path';
import type { AgentState, AgentStateSummary, SonarIssuesPayload, TrackedIssue } from './types.js';
import { getConfig } from './config.js';
import { ISSUES_FILE, STATE_FILE } from './utils.js';

export function calculateSummary(issues: TrackedIssue[]): AgentStateSummary {
  const summary: AgentStateSummary = {
    totalTracked: issues.length,
    pending: 0,
    investigating: 0,
    fixed: 0,
    verified: 0,
    falsePositive: 0,
    wontFix: 0,
    deferred: 0,
  };

  for (const issue of issues) {
    switch (issue.status) {
      case 'pending':
        summary.pending++;
        break;
      case 'investigating':
        summary.investigating++;
        break;
      case 'fixed':
        summary.fixed++;
        break;
      case 'verified':
        summary.verified++;
        break;
      case 'false-positive':
        summary.falsePositive++;
        break;
      case 'wont-fix':
        summary.wontFix++;
        break;
      case 'deferred':
        summary.deferred++;
        break;
    }
  }

  return summary;
}

export async function loadState(): Promise<AgentState> {
  const config = getConfig();
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      project: parsed.project || config.projectKey,
      lastAnalysis: parsed.lastAnalysis,
      lastUpdated: parsed.lastUpdated || new Date().toISOString(),
      summary: parsed.summary || {
        totalTracked: 0,
        pending: 0,
        investigating: 0,
        fixed: 0,
        verified: 0,
        falsePositive: 0,
        wontFix: 0,
        deferred: 0,
      },
      issues: parsed.issues || {},
    };
  } catch {
    return {
      project: config.projectKey,
      lastUpdated: new Date().toISOString(),
      summary: {
        totalTracked: 0,
        pending: 0,
        investigating: 0,
        fixed: 0,
        verified: 0,
        falsePositive: 0,
        wontFix: 0,
        deferred: 0,
      },
      issues: {},
    };
  }
}

export async function saveState(state: AgentState): Promise<void> {
  const issueList = Object.values(state.issues);
  state.summary = calculateSummary(issueList);
  state.lastUpdated = new Date().toISOString();
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export async function loadIssuesPayload(): Promise<SonarIssuesPayload> {
  try {
    const raw = await fs.readFile(ISSUES_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error reading ${ISSUES_FILE}: ${message}`);
    console.error('Make sure to run ./scripts/sonar.sh && ./scripts/sonar-export.sh first.');
    process.exit(1);
  }
}
