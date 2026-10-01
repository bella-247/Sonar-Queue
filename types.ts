export type IssueStatus =
  | 'pending'
  | 'investigating'
  | 'fixed'
  | 'verified'
  | 'false-positive'
  | 'wont-fix'
  | 'deferred';

export interface SonarIssueTextRange {
  startLine: number;
  endLine: number;
  startOffset?: number;
  endOffset?: number;
}

export interface SonarIssue {
  key: string;
  rule: string;
  severity: string;
  component: string;
  project: string;
  line?: number;
  textRange?: SonarIssueTextRange;
  status: string;
  resolution?: string;
  message: string;
  effort?: string;
  debt?: string;
  type: string;
}

export interface SonarIssuesPayload {
  total?: number;
  issues: SonarIssue[];
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
