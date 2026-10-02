# Data Model

## Overview

Sonar Queue maintains a **single source of truth**: `sonarqube-results/agent-state.json`. This file contains the complete workflow state for all tracked issues. No intermediate files (no `issues.json`, `metrics.json`, etc.) — the `sync` command fetches directly from SonarQube and updates this file atomically.

---

## File Location

```
<project-root>/
└── sonarqube-results/
    └── agent-state.json    ← Single source of truth
```

The path is configurable via:
- `SONAR_STATE_FILE` env var
- `sonar-queue.json` → `stateFile`
- Default: `./sonarqube-results/agent-state.json`

---

## JSON Structure

```json
{
  "project": "my-project-key",
  "lastAnalysis": "2026-01-15T10:30:00.000Z",
  "lastUpdated": "2026-01-15T14:22:15.123Z",
  "summary": {
    "totalTracked": 42,
    "pending": 15,
    "investigating": 3,
    "fixed": 5,
    "verified": 12,
    "falsePositive": 2,
    "wontFix": 3,
    "deferred": 2
  },
  "issues": {
    "AX9z8K7mNpQ": {
      "issueKey": "AX9z8K7mNpQ",
      "rule": "typescript:S1234",
      "severity": "CRITICAL",
      "type": "BUG",
      "file": "src/auth/login.ts",
      "line": 42,
      "message": "Potential null pointer dereference",
      "status": "investigating",
      "firstSeen": "2026-01-10T08:00:00.000Z",
      "lastSeen": "2026-01-15T14:20:00.000Z",
      "attempts": 2,
      "claimedAt": "2026-01-15T14:15:00.000Z",
      "fixedAt": null,
      "verifiedAt": null,
      "notes": "Added null check at line 40",
      "component": "src/auth/login.ts"
    },
    "BY3x9L2mQrW": {
      "issueKey": "BY3x9L2mQrW",
      "rule": "typescript:S3776",
      "severity": "MAJOR",
      "type": "CODE_SMELL",
      "file": "src/utils/parser.ts",
      "line": 15,
      "message": "Cognitive Complexity of 28 exceeds 15",
      "status": "verified",
      "firstSeen": "2026-01-10T08:00:00.000Z",
      "lastSeen": "2026-01-14T16:00:00.000Z",
      "attempts": 1,
      "claimedAt": "2026-01-12T10:00:00.000Z",
      "fixedAt": "2026-01-13T15:30:00.000Z",
      "verifiedAt": "2026-01-14T16:00:00.000Z",
      "notes": "Extracted helper functions: parseHeader, parseBody, validateChecksum",
      "component": "src/utils/parser.ts"
    }
  }
}
```

---

## Field Reference

### Root Fields

| Field | Type | Description |
|-------|------|-------------|
| `project` | string | SonarQube project key |
| `lastAnalysis` | string (ISO) | Timestamp of last successful scan (from CE task) |
| `lastUpdated` | string (ISO) | When this state file was last written |
| `summary` | AgentStateSummary | Aggregated counts |
| `issues` | Record<string, TrackedIssue> | Keyed by issueKey |

### AgentStateSummary

| Field | Type | Description |
|-------|------|-------------|
| `totalTracked` | number | Total issues ever tracked |
| `pending` | number | Unassigned, awaiting claim |
| `investigating` | number | Actively claimed |
| `fixed` | number | Marked fixed, awaiting verification scan |
| `verified` | number | Confirmed fixed by subsequent scan |
| `falsePositive` | number | Marked as analyzer error |
| `wontFix` | number | Accepted as valid exception |
| `deferred` | number | Postponed to future sprint |

### TrackedIssue

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `issueKey` | string | Yes | SonarQube issue key (primary key) |
| `rule` | string | Yes | Rule key (e.g., `typescript:S1234`) |
| `severity` | string | Yes | `BLOCKER` \| `CRITICAL` \| `MAJOR` \| `MINOR` \| `INFO` |
| `type` | string | Yes | `BUG` \| `VULNERABILITY` \| `CODE_SMELL` \| `SECURITY_HOTSPOT` |
| `file` | string | Yes | Relative file path |
| `line` | number | No | Line number (may be missing for file-level issues) |
| `message` | string | Yes | Human-readable description |
| `status` | IssueStatus | Yes | Current workflow state |
| `firstSeen` | string (ISO) | Yes | When first discovered in scan |
| `lastSeen` | string (ISO) | Yes | When last seen in scan |
| `attempts` | number | Yes | Fix attempts (increments on claim + regression) |
| `claimedAt` | string (ISO) | No | When claimed (set on `claim`) |
| `fixedAt` | string (ISO) | No | When marked `fixed` (set on `resolve`) |
| `verifiedAt` | string (ISO) | No | When promoted to `verified` (set by `sync`) |
| `notes` | string | No | Resolution notes, regression logs, reasons |
| `component` | string | Yes | Full SonarQube component path |

---

## IssueStatus Enum

```typescript
type IssueStatus =
  | 'pending'         // Discovered, unassigned
  | 'investigating'   // Claimed, actively being worked
  | 'fixed'           // Code modified, locally verified, awaiting scan
  | 'verified'        // Confirmed fixed by subsequent scan
  | 'false-positive'  // Analyzer error
  | 'wont-fix'        // Valid finding, accepted by architecture
  | 'deferred';       // Postponed to future sprint
```

### State Transitions

```
pending ──claim──► investigating ──resolve──► fixed ──sync──► verified
    │                │                      │
    │                │                      │
    │                │                      ▼
    │                │                 (regression)
    │                │                      │
    └────────────────┴──────────────────────┘
         ▲
         │
         │ reset (from investigating/fixed)
         
Terminal states (no auto-transition):
  wont-fix, false-positive, deferred
```

### Transition Triggers

| From | To | Trigger |
|------|-----|---------|
| `pending` | `investigating` | `claim` / `claim-next` |
| `investigating` | `fixed` | `resolve` |
| `investigating` | `pending` | `reset` |
| `fixed` | `pending` | `sync` (regression: still open in scan) |
| `fixed` | `verified` | `sync` (gone from scan) |
| `pending`/`investigating` | — | `sync` (gone from scan → note only) |
| `pending`/`investigating`/`fixed` | `wont-fix` | `wontfix` |
| `pending`/`investigating`/`fixed` | `false-positive` | `falsepositive` |
| `pending`/`investigating`/`fixed` | `deferred` | `defer` |
| `investigating`/`fixed` | `pending` | `reset` |

---

## SonarIssue (From SonarQube)

Used internally during `sync` — minimal fields fetched from `/api/issues/search`:

```typescript
interface SonarIssue {
  key: string;
  rule: string;
  severity: string;
  type: string;
  file: string;
  line?: number;
  message: string;
  status?: string;       // SonarQube status (OPEN, CONFIRMED, etc.)
  resolution?: string;   // FIXED, FALSE_POSITIVE, WONTFIX, etc.
}
```

**Mapping to TrackedIssue:**
- `key` → `issueKey`
- `rule`, `severity`, `type`, `message` → direct copy
- `component` → `extractRelativeFile()` → `file`
- `line` / `textRange.startLine` → `line`
- `status` + `resolution` → used to determine open/closed in `sync`

---

## Atomic Write Guarantee

`saveState()` in `state.ts` ensures no corruption:

```typescript
// 1. Compute summary + timestamp
state.summary = calculateSummary(issueList);
state.lastUpdated = new Date().toISOString();

// 2. Ensure directory exists
await fs.mkdir(dir, { recursive: true });

// 3. Write to temp file with random name
const tempFile = path.join(dir, `.agent-state.${Date.now()}.${crypto.randomUUID()}.tmp`);
await fs.writeFile(tempFile, JSON.stringify(state, null, 2), 'utf-8');

// 4. Atomic rename (POSIX guarantee)
await fs.rename(tempFile, config.stateFile);
```

This prevents:
- Partial writes (crash mid-write)
- Corruption from concurrent writes
- Truncated files on disk full

---

## Git Considerations

### `.gitignore` (recommended)
```
sonarqube-results/*
!sonarqube-results/agent-state.json
```

**Why commit `agent-state.json`?**
- Shares remediation progress across team/machines
- Reviewable in PRs (shows what was fixed, why, regressions)
- Survives `git checkout`, `git stash`, CI/CD runs

### What NOT to commit
```
sonarqube-results/issues.json        # Not created anymore
sonarqube-results/metrics.json       # Not created anymore
sonarqube-results/quality-gate.json  # Not created anymore
sonarqube-results/report.md          # Not created anymore
.scannerwork/                        # Scanner temp files
.env.sonar.local                     # Contains secrets
```

---

## Migration from Old Format

If you have legacy `issues.json` / `agent-state.json` from pre-lean version:

1. Run `sonar-queue sync` — it will fetch fresh lean issues and rebuild state
2. Old `issues.json` can be deleted
3. `agent-state.json` will be recreated with lean data + workflow fields

No manual migration needed — the lean `sync` is backward compatible.

---

## Querying State Programmatically

```typescript
import { loadState } from 'sonar-queue/state.js';

const state = await loadState();

// All pending issues
const pending = Object.values(state.issues).filter(i => i.status === 'pending');

// Issues with regressions (attempts > 1)
const regressed = Object.values(state.issues).filter(i => i.attempts > 1);

// Stale claims (investigating > 24h)
const stale = Object.values(state.issues).filter(i => {
  if (i.status !== 'investigating') return false;
  const claimed = new Date(i.claimedAt).getTime();
  return Date.now() - claimed > 24 * 60 * 60 * 1000;
});

// Verified fixes this week
const recentVerified = Object.values(state.issues).filter(i => {
  if (i.status !== 'verified' || !i.verifiedAt) return false;
  return Date.now() - new Date(i.verifiedAt).getTime() < 7 * 24 * 60 * 60 * 1000;
});
```

---

## Performance Notes

- `agent-state.json` is typically **1–50 KB** (vs 50 KB – 5 MB for old `issues.json`)
- `loadState` / `saveState` are synchronous-ish (single file read/write)
- `sync` fetches from SonarQube via paginated API (500/page) — typically <2s for 1000 issues
- No database, no external dependencies — pure JSON file