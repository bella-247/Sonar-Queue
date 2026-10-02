import type { TrackedIssue } from '../types.js';

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
  const fileDiff = (a.file || a.component || '').localeCompare(b.file || b.component || '');
  if (fileDiff !== 0) return fileDiff;
  return (a.line ?? 0) - (b.line ?? 0);
}
