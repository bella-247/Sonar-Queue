import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AgentState, AgentStateSummary, TrackedIssue } from './types.js';
import { getConfig } from './setup/config.js';

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
    const raw = await fs.readFile(config.stateFile, 'utf-8');
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
  const config = getConfig();
  const issueList = Object.values(state.issues);
  state.summary = calculateSummary(issueList);
  state.lastUpdated = new Date().toISOString();

  const dir = path.dirname(config.stateFile);
  await fs.mkdir(dir, { recursive: true });

  const tempFile = path.join(dir, `.agent-state.${Date.now()}.${crypto.randomUUID()}.tmp`);
  await fs.writeFile(tempFile, JSON.stringify(state, null, 2), 'utf-8');
  await fs.rename(tempFile, config.stateFile);
}