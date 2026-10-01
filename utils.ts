import { getConfig } from './config.js';
import type { TrackedIssue } from './types.js';

export const PROJECT_ROOT = getConfig().projectRoot;
export const RESULTS_DIR = getConfig().resultsDir;
export const ISSUES_FILE = getConfig().issuesFile;
export const STATE_FILE = getConfig().stateFile;

export const SEVERITY_WEIGHT: Record<string, number> = {
  BLOCKER: 5,
  CRITICAL: 4,
  MAJOR: 3,
  MINOR: 2,
  INFO: 1,
};

export const TYPE_WEIGHT: Record<string, number> = {
  BUG: 3,
  VULNERABILITY: 2,
  CODE_SMELL: 1,
  SECURITY_HOTSPOT: 1,
};

export function extractRelativeFile(component: string): string {
  const colonIndex = component.indexOf(':');
  return colonIndex !== -1 ? component.slice(colonIndex + 1) : component;
}

export function compareIssuesPriority(a: TrackedIssue, b: TrackedIssue): number {
  const sevDiff = (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0);
  if (sevDiff !== 0) return sevDiff;
  const typeDiff = (TYPE_WEIGHT[b.type] || 0) - (TYPE_WEIGHT[a.type] || 0);
  if (typeDiff !== 0) return typeDiff;
  return (a.file || a.component || '').localeCompare(b.file || b.component || '');
}
