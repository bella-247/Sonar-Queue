# API Reference

## Core Types (`types.ts`)

### `IssueStatus`
```typescript
type IssueStatus =
  | 'pending'
  | 'investigating'
  | 'fixed'
  | 'verified'
  | 'false-positive'
  | 'wont-fix'
  | 'deferred';
```

### `SonarIssue` — Issue fetched from SonarQube
```typescript
interface SonarIssue {
  key: string;           // SonarQube issue key (e.g., "AX9z...")
  rule: string;          // Rule key (e.g., "typescript:S1234")
  severity: string;      // BLOCKER | CRITICAL | MAJOR | MINOR | INFO
  type: string;          // BUG | VULNERABILITY | CODE_SMELL | SECURITY_HOTSPOT
  component?: string;    // Full component path (e.g., "project:src/file.ts")
  file: string;          // Relative file path (e.g., "src/file.ts")
  line?: number;         // Line number
  message: string;       // Human-readable issue description
  status?: string;       // SonarQube status (OPEN, CONFIRMED, etc.)
  resolution?: string;   // FIXED | FALSE_POSITIVE | WONTFIX | etc.
}
```

### `TrackedIssue` — Extended with workflow state
```typescript
interface TrackedIssue {
  issueKey: string;      // Same as SonarIssue.key
  rule: string;
  severity: string;
  type: string;
  file: string;
  line?: number;
  message: string;
  status: IssueStatus;   // 7-state workflow
  firstSeen: string;     // ISO timestamp
  lastSeen: string;      // ISO timestamp
  attempts: number;      // Fix attempts (increments on claim + regression)
  claimedAt?: string;    // ISO timestamp when claimed
  fixedAt?: string;      // ISO timestamp when resolved
  verifiedAt?: string;   // ISO timestamp when verified
  notes?: string;        // Resolution notes, regression logs
  component: string;     // Full component path
}
```

### `AgentStateSummary`
```typescript
interface AgentStateSummary {
  totalTracked: number;
  pending: number;
  investigating: number;
  fixed: number;
  verified: number;
  falsePositive: number;
  wontFix: number;
  deferred: number;
}
```

### `AgentState` — Persisted state
```typescript
interface AgentState {
  project: string;           // Project key
  lastAnalysis?: string;     // ISO timestamp of last scan
  lastUpdated: string;       // ISO timestamp of last state change
  summary: AgentStateSummary;
  issues: Record<string, TrackedIssue>;  // Keyed by issueKey
}
```

---

## State Management (`state.ts`)

### `calculateSummary(issues: TrackedIssue[]): AgentStateSummary`
Computes summary counts from issue array. Used by `saveState`.

### `loadState(): Promise<AgentState>`
Loads `agent-state.json` from `config.stateFile`. Returns empty state if file missing/corrupt.

### `saveState(state: AgentState): Promise<void>`
- Recomputes `summary` via `calculateSummary`
- Updates `lastUpdated` to now
- Writes atomically: writes to temp file → `fs.rename()` to target

---

## Priority Utilities (`utils/priority.ts`)

### Constants
```typescript
SEVERITY_WEIGHT = { BLOCKER: 5, CRITICAL: 4, MAJOR: 3, MINOR: 2, INFO: 1 }
TYPE_WEIGHT = { BUG: 3, VULNERABILITY: 2, CODE_SMELL: 1, SECURITY_HOTSPOT: 1 }
```

### `extractRelativeFile(component: string): string`
Strips project prefix from SonarQube component path.
```typescript
// "my-project:src/auth.ts" → "src/auth.ts"
// "src/auth.ts" → "src/auth.ts"
```

### `compareIssuesPriority(a: TrackedIssue, b: TrackedIssue): number`
Sort comparator for issue prioritization:
1. **Severity** (higher first) — BLOCKER > CRITICAL > MAJOR > MINOR > INFO
2. **Type** (higher first) — BUG > VULNERABILITY > CODE_SMELL > SECURITY_HOTSPOT
3. **File path** (alphabetical)

---

## Scanner Detection (`utils/scanner.ts`)

### `findSonarScanner(): ScannerInfo | null`
```typescript
interface ScannerInfo {
  bin: string;      // 'sonar-scanner' or 'sonar-scanner.bat'
  version: string;  // e.g., "SonarScanner 8.1.0.6389"
}
```
Checks both `sonar-scanner` and `sonar-scanner.bat` in PATH with `--version`.

---

## Export Module (`queue/export.ts`)

### `fetchIssuesFromSonar(): Promise<SonarIssue[]>`
Main entry point:
1. Validates `config.token`
2. Waits for Compute Engine task via `report-task.txt` (`waitForCeTask`)
3. Fetches all issues via paginated `/api/issues/search` (pageSize=500)
4. Maps to `SonarIssue` (7 lean fields + status/resolution)

### `waitForCeTask(projectRoot, hostUrl, headers): Promise<void>`
Polls `/api/ce/task?id={ceTaskId}` from `.scannerwork/report-task.txt` until SUCCESS/FAILED/CANCELED.

### `handleExport(): Promise<void>`
Convenience command: loads state, calls `handleSync` directly (so `export` = `sync` without prior state load).

---

## Sync Module (`queue/sync.ts`)

### `handleSync(state, stateMap): Promise<void>`
Core reconciliation logic:

1. **Fetch lean issues** from SonarQube via `fetchIssuesFromSonar()`
2. **Build `openScanMap`** — issues where `status !== 'CLOSED' && resolution !== 'FIXED'`
3. **`syncOpenIssues`** — For each open issue in scan:
   - New → add as `pending` with `firstSeen=now`, `attempts=0`
   - Existing → update `lastSeen`, `line`, `file`, `message`
   - **If `existing.status === 'fixed'`** → **REGRESSION**: reopen to `pending`, `attempts++`, append `[Reopened] Attempt #N failed...`
4. **`reconcileStateIssues`** — For each tracked issue:
   - **If `fixed` AND not in open scan** → `verified`, `verifiedAt=now`
   - **If `pending|investigating` AND not in open scan** → add note "Disappeared from scan (removed/excluded)"
5. **Save state atomically** via `saveState()`
6. **Log**: `Synced: {newCount} new, {verifiedCount} verified{, N reopened}`

---

## Scan Module (`queue/scan.ts`)

### `handleScan(args: string[]): void`
1. Validates token, finds `sonar-scanner` via `findSonarScanner()`
2. Runs `spawnSync(scanner.bin, ['-Dsonar.token=...', ...args], { stdio: 'inherit', cwd: config.projectRoot })`
3. On success: prints "Run: sonar-queue export to fetch results"

---

## Status Module (`queue/status.ts`)

### `handleStatus(stateMap, args): void`
Options: `--file <path>` / `-f` — filter by file path

Outputs two lines:
```
Issues: 12 active (5 critical, 4 major, 3 minor | 8 bug, 4 code_smell), 3 verified
Queue:  5 pending, 2 investigating, 3 fixed, 3 verified, 1 wont-fix, 0 fp, 1 deferred (15 total)
```

---

## Next/Claim Module (`queue/next.ts`)

### `parseFilterOptions(args): NextFilterOptions`
```typescript
interface NextFilterOptions {
  count: number;           // Default 5
  file?: string;           // --file / -f
  rule?: string;           // --rule / -r
  severity?: string[];     // --severity / -s (comma-separated)
  type?: string;           // --type / -t
}
```

### `matchesFilter(issue, filter): boolean`
Case-insensitive substring match on `file`, `rule`; exact match on `severity[]`, `type`.

### `handleNext(stateMap, args): void`
1. Parse filters
2. Filter `status === 'pending'` + `matchesFilter`
3. Sort by `compareIssuesPriority`
4. Slice `count`
5. Print each: `[key] SEVERITY TYPE | file:line | rule (attempt #N)` + message

### `handleClaim(state, stateMap, args): Promise<void>`
- `claim <key>` — Single issue
- Sets `status = 'investigating'`, `claimedAt = now`, `attempts++`

### `handleClaimNext(state, stateMap, args): Promise<void>`
- `claim-next [N] [--file] [--rule]` — Batch claim
- Same filters as `next`, claims all matching pending issues

---

## Resolution Commands (`queue/resolve.ts`, `wontfix.ts`, `falsepositive.ts`, `defer.ts`, `reset.ts`)

All follow same pattern:
1. Validate key exists in `stateMap`
2. Validate reason (required for wontfix/falsepositive/defer)
3. Update `status`, timestamps, `notes`
3. `saveState(state)`

| Command | New Status | Notes |
|---------|------------|-------|
| `resolve <key> [notes]` | `fixed` | `fixedAt=now`, optional notes |
| `wontfix <key> <reason>` | `wont-fix` | Reason required, stored in `notes` |
| `falsepositive <key> <reason>` | `false-positive` | Reason required |
| `defer <key> <reason>` | `deferred` | Reason required |
| `reset <key>` | `pending` | Clears `claimedAt`, `fixedAt` |

---

## Config (`setup/config.ts`)

### `getConfig(overrideRoot?): SonarQueueConfig`
Resolves config by cascading priority:
1. `process.env.SONAR_*` / `SONAR_PROJECT_ROOT`
2. `sonar-queue.json` (custom)
3. `sonar-project.properties`
4. `.env.sonar.local`
5. `package.json` (name)
6. Defaults

### `SonarQueueConfig`
```typescript
interface SonarQueueConfig {
  projectRoot: string;   // Project root directory
  projectKey: string;    // SonarQube project key
  projectName: string;   // Display name
  hostUrl: string;       // SonarQube server URL
  token?: string;        // SONAR_TOKEN
  resultsDir: string;    // Output directory (default: ./sonarqube-results)
  stateFile: string;     // agent-state.json path
}
```

---

## Stack Detection (`setup/detect.ts`)

### `detectStack(projectRoot): DetectedStack`
```typescript
interface DetectedStack {
  typescript: boolean;   // tsconfig.json or 'typescript' in deps
  react: boolean;        // 'react' in deps
  vite: boolean;         // 'vite' in deps
  vitest: boolean;       // 'vitest' in deps
  jest: boolean;         // 'jest' or '@jest/core' in deps
  hasSrc: boolean;       // src/ directory exists
  hasTest: boolean;      // test/ or __tests__/ exists
  hasCoverage: boolean;  // coverage/ or coverage/lcov.info exists
}
```

### `printDetectedStack(stack): void`
Pretty-prints detected features.

---

## Docker (`setup/docker.ts`)

### Constants
- `CONTAINER_NAME = 'sonarqube'`
- `DEFAULT_PORT = 9100`
- `SONARQUBE_VERSION = '26.9.0.129388-community'`
- `COMPOSE_FILE = ~/.local/share/sonar-queue/compose.yml`

### `handleStart(args): void`
1. Checks Docker + Compose availability
2. Ensures compose file exists
3. `docker compose -f COMPOSE_FILE up -d`
4. Prints URL and readiness hint

### `handleStop(): void`
- `docker compose -f COMPOSE_FILE stop` (preserves volumes)

### `handleRestart(args): void`
- `handleStop()` + `handleStart([])`

### `handleReset(args): Promise<void>`
- Interactive confirmation (y/N)
- `docker compose down -v` (removes volumes)
- Removes compose file

### `handleDockerStatus(): void`
- Shows container status (running/stopped/none)
- If running: shows URL + uptime via `docker inspect`

---

## Doctor (`setup/doctor.ts`)

### `handleDoctor(): Promise<void>`
Runs 13 checks across 6 sections:

| Section | Checks |
|---------|--------|
| **System** | OS, Node.js (≥18), npm |
| **Docker** | Docker, Docker daemon, Docker Compose |
| **SonarQube** | SonarQube container, PostgreSQL container |
| **Project** | `sonar-project.properties`, `.env.sonar.local` |
| **Scanner** | `sonar-scanner` in PATH |
| **Connectivity** | SonarQube reachable (`/api/system/ping`), Token valid (`/api/authentication/validate`) |

Collects all `CheckResult` into single array, derives summary from it (fixes previous bug where summary missed checks).

---

## Init (`setup/init.ts`)

### `handleInit(args): Promise<void>`
Options: `--force` / `-f` — Re-install skill template

Bootstraps:
1. `sonar-project.properties` (from template or defaults)
2. `.env.sonar.local.example` (from template)
3. `.gitignore` entries (`.scannerwork/`, `.env.sonar.local`)
4. `.agents/skills/sonar-scanner/SKILL.md` (from `templates/SKILL.md`)

Skips if already initialized (unless `--force`).

---

## Wizard (`setup/wizard.ts`)

### `handleSetup(args): Promise<void>`
Interactive setup via readline:
1. Detects stack, prints detected features
2. Prompts for project key, name, SonarQube URL
3. **`promptAndVerifyToken`** — Validates token format + verifies with SonarQube
4. Writes `.env.sonar.local` (mode 0600), `sonar-project.properties`
5. Creates results dir, updates `.gitignore`
6. Prints next steps

---

## Properties (`setup/properties.ts`)

### `buildPropertiesContent(key, name, url, stack): string`
Generates `sonar-project.properties` tailored to detected stack:
- TypeScript → `sonar.typescript.tsconfigPath=tsconfig.json`
- Tests → `sonar.test.inclusions=**/*.test.ts,...`
- Coverage → `sonar.javascript.lcov.reportPaths=coverage/lcov.info`
- Always adds standard exclusions (node_modules, dist, build, .next, coverage)

### `writePropertiesFile(...): Promise<void>`
Writes file (skips if exists unless forced via init).

---

## Token (`setup/token.ts`)

### Constants
```typescript
VALID_TOKEN_PREFIXES = ['sqp_', 'squ_', 'sqa_']
TOKEN_PREFIX_DESCRIPTIONS = {
  sqp_: 'Project Analysis Token (recommended)',
  squ_: 'User Token (carries user permissions)',
  sqa_: 'Global Analysis Token (multi-project)'
}
```

### `getTokenPrefix(token): TokenPrefix | null`
Returns prefix if token starts with valid prefix.

### `isValidTokenFormat(token): boolean`
Length ≥ 20 + valid prefix.

### `validateTokenWithServer(hostUrl, token): Promise<{reachable, valid, error?}>`
Calls `/api/authentication/validate` with Basic auth.

### `promptAndVerifyToken(rl, hostUrl, projectKey, existingToken?): Promise<string>`
Interactive loop:
1. Shows token format guidance
2. Prompts (shows masked existing if valid)
3. Validates prefix + length
4. Calls `validateTokenWithServer`
5. On success → returns token
6. On 401/403 → asks to save anyway
7. On unreachable → accepts format, warns to run `doctor` after `start`

---

## CLI Entry Point (`index.ts`)

### Command Dispatch
- **Infrastructure (no state load)**: `init`, `setup`, `export`, `doctor`, `start`, `stop`, `restart`, `docker-reset`, `docker-status`, `scan`
- **Queue (requires state load)**: `sync`, `next`, `claim`, `claim-next`, `resolve`, `wontfix`, `falsepositive`, `defer`, `reset`, `status`

### State Loading
```typescript
const state = await loadState();
const stateMap = new Map<string, TrackedIssue>(Object.entries(state.issues));
await handler(state, stateMap, args);
```

---

## Bin Wrapper (`bin/sonar-queue.js`)

```javascript
#!/usr/bin/env node
// Tries: import('../dist/index.js')
// Falls back: spawns `tsx index.ts` with same args
```
Allows `npx sonar-queue` or global install.

---

## Templates

### `templates/SKILL.md`
AI agent protocol (installed via `init` → `.agents/skills/sonar-scanner/SKILL.md`)

### `templates/sonar-project.properties.template`
Template with `{{PROJECT_KEY}}`, `{{PROJECT_NAME}}` placeholders.

### `templates/.env.sonar.local.template`
```
SONAR_TOKEN=sqp_your_token_here
SONAR_HOST_URL=http://localhost:9100
```