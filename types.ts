export type IssueStatus =
  | 'pending'
  | 'investigating'
  | 'fixed'
  | 'verified'
  | 'false-positive'
  | 'wont-fix'
  | 'deferred';

export interface SonarIssue {
  key: string;
  rule: string;
  severity: string;
  type: string;
  component?: string;
  file: string;
  line?: number;
  message: string;
  status?: string;
  resolution?: string;
}

export interface TrackedIssue {
  issueKey: string;
  rule: string;
  severity: string;
  type: string;
  file: string;
  line?: number;
  message: string;
  status: IssueStatus;
  firstSeen: string;
  lastSeen: string;
  attempts: number;
  claimedAt?: string;
  fixedAt?: string;
  verifiedAt?: string;
  notes?: string;
  component: string;
}

export interface AgentStateSummary {
  totalTracked: number;
  pending: number;
  investigating: number;
  fixed: number;
  verified: number;
  falsePositive: number;
  wontFix: number;
  deferred: number;
}

export interface AgentState {
  project: string;
  lastAnalysis?: string;
  lastUpdated: string;
  summary: AgentStateSummary;
  issues: Record<string, TrackedIssue>;
}
