# Workflow Guide

## The Complete Sonar Queue Workflow

This guide walks through the full remediation cycle from scan to verified fix.

---

## Prerequisites

```bash
# One-time setup per project
cd /path/to/your/project
npx sonar-queue init

# Edit .env.sonar.local with your token
# SONAR_TOKEN=sqp_...
# SONAR_HOST_URL=http://localhost:9100  (or your SonarQube URL)
```

---

## Phase 1: Scan & Sync

```bash
# 1. Run SonarQube analysis (with auto token injection)
sonar-queue scan

# 2. Fetch lean issues + reconcile into local queue
#    This also verifies any previously "fixed" issues
sonar-queue sync

# 3. View current queue state
sonar-queue status
```

**What `sync` does:**
- Fetches open issues from SonarQube (7 lean fields each)
- Adds new issues as `pending`
- **Regression detection**: If you marked something `fixed` but it's still open → reopens to `pending`, increments `attempts`, logs note
- **Verification**: If you marked `fixed` and it's gone → promotes to `verified`
- Saves all to `sonarqube-results/agent-state.json`

---

## Phase 2: Scope Your Batch

```bash
# See top 5 critical/major issues across project
sonar-queue next 5 --severity BLOCKER,CRITICAL,MAJOR

# Focus on a specific module
sonar-queue next 5 --file src/auth --severity BLOCKER,CRITICAL

# Filter by rule
sonar-queue next 10 --rule S3776

# Filter by type
sonar-queue next 10 --type BUG
```

**Output format (~35 tokens/issue):**
```
[AX9z...] CRITICAL BUG | src/auth/login.ts:42 | typescript:S1234 (attempt #2)
  Potential null pointer dereference
```

---

## Phase 3: Claim Work

```bash
# Claim a single issue (locks to you, increments attempts)
sonar-queue claim AX9z...

# Claim a batch (file-cohesive — fix all in one file together)
sonar-queue claim-next 5 --file src/auth
```

**What `claim` does:**
- Transitions `pending` → `investigating`
- Sets `claimedAt = now`
- Increments `attempts`
- Persists to `agent-state.json`

> **Why claim?** Prevents multiple agents/humans from working the same issue. The `attempts` counter tracks how many times you've tried to fix it.

---

## Phase 4: Inspect & Fix

```bash
# Read the exact lines around the issue
# For issue at src/auth/login.ts:42
cat -n src/auth/login.ts | sed -n '37,47p'
# Or use your editor to jump to line 42
```

**Best practices:**
- Read `line - 5` to `line + 5` — don't guess context
- Check for other pending issues in the same file:
  ```bash
  sonar-queue next 10 --file src/auth/login.ts
  ```
- Fix all issues in that file in one edit pass (eliminates context thrashing)

---

## Phase 5: Evaluate & Apply Fix

| Scenario | Action | Command |
|----------|--------|---------|
| Legitimate bug/smell | Refactor root cause cleanly | (edit code) |
| External API contract | Accept as `wont-fix` | `sonar-queue wontfix KEY "Required by third-party API"` |
| Type already guarded | Mark `false-positive` | `sonar-queue falsepositive KEY "Guarded by null check above"` |
| High regression risk | Defer to future sprint | `sonar-queue defer KEY "High blast radius; isolate in refactor epic"` |

**Local verification (Tier 1 + 2):**
```bash
# Tier 1: Fast typecheck (mandatory)
npm run typecheck  # or: tsc --noEmit

# Tier 2: Targeted test (if exists)
npm test -- src/auth/login.test.ts
```

> **Never run the full monolithic test suite** for incremental fixes.

---

## Phase 6: Mark Resolved

```bash
# Mark as fixed (awaiting verification scan)
sonar-queue resolve AX9z... "Extracted null check to guard clause"
```

**What `resolve` does:**
- Transitions `investigating` → `fixed`
- Sets `fixedAt = now`
- Stores your note in `notes`
- **Does NOT verify yet** — that happens on next `sync`

---

## Phase 7: Sync & Verify (REQUIRED)

```bash
# After resolving a batch, you MUST run sync
sonar-queue sync
```

**What `sync` verifies:**
| Your State | Scan Result | Action |
|------------|-------------|--------|
| `fixed` | Gone from scan | ✅ `verified` (promoted) |
| `fixed` | Still open | 🔄 **REGRESSION** → `pending`, `attempts++`, note added |
| `pending`/`investigating` | Gone from scan | Note: "Disappeared from scan (removed/excluded)" |

**Output:**
```
Synced: 3 new, 2 verified, 1 reopened
```

> **If regressions occur**: Read the regression note in `agent-state.json`, adjust your fix, re-claim, re-resolve, then `sync` again.

---

## Phase 8: Repeat or Stop

```bash
# Check if queue is empty
sonar-queue next

# If no pending issues → DONE
# "No pending issues."
```

---

## Quick Reference: Command Cheatsheet

| Command | Purpose | Mutates State? |
|---------|---------|----------------|
| `scan` | Run sonar-scanner | No |
| `sync` | Fetch + reconcile + verify | **Yes** |
| `export` | Alias for sync (no prior state) | **Yes** |
| `status` | Queue + scan summary | No |
| `next [N] [--file] [--rule] [--severity] [--type]` | View pending | No |
| `claim <key>` | Lock single issue | **Yes** |
| `claim-next [N] [--file] [--rule]` | Lock batch | **Yes** |
| `resolve <key> [notes]` | Mark fixed | **Yes** |
| `wontfix <key> <reason>` | Accept finding | **Yes** |
| `falsepositive <key> <reason>` | Mark analyzer error | **Yes** |
| `defer <key> <reason>` | Postpone | **Yes** |
| `reset <key>` | Back to pending | **Yes** |

---

## Filters for `next` / `claim-next`

| Flag | Short | Example |
|------|-------|---------|
| `--file <path>` | `-f` | `--file src/auth` |
| `--rule <key>` | `-r` | `--rule S3776` |
| `--severity <list>` | `-s` | `--severity BLOCKER,CRITICAL` |
| `--type <type>` | `-t` | `--type BUG` |
| `<N>` | — | `next 10` (default 5) |

---

## Troubleshooting

### "SONAR_TOKEN is not configured"
```bash
# Edit .env.sonar.local
SONAR_TOKEN=sqp_your_token_here
SONAR_HOST_URL=http://localhost:9100
```

### "sonar-scanner not found in PATH"
```bash
# Install SonarScanner
# https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/scanners/sonarscanner/
# Then verify:
sonar-queue doctor
```

### "Docker not found" / "Compose not available"
```bash
# Install Docker + Compose v2
# https://docs.docker.com/engine/install/
sonar-queue doctor
```

### SonarQube not reachable
```bash
# Start local instance
sonar-queue start

# Wait 30-60s, then check
sonar-queue doctor
```

### Scan failed
```bash
# Check scanner output above the error
# Common: missing sonar-project.properties, wrong token, network issues
sonar-queue doctor  # Diagnoses all of the above
```

### Sync shows 0 new but issues exist in SonarQube
```bash
# Check project key matches
sonar-queue doctor  # Shows project config

# Verify token has access to project
```

---

## Advanced: Multi-Agent Workflow

If multiple agents/humans work the same repo:

1. **Each agent runs their own `claim`/`claim-next`** — state is shared via `agent-state.json`
2. **Atomic writes** — `saveState` uses temp file + rename (no corruption)
3. **Attempts counter** — Shows how many times an issue was attempted
4. **Regression detection** — Catches when a "fixed" issue wasn't actually fixed

> **Tip**: Commit `sonarqube-results/agent-state.json` to share progress across machines/agents.

---

## File-Cohesive Batching Example

```bash
# 1. Scope: See all issues in a module
sonar-queue next 20 --file src/features/orders

# 2. Claim all in that module
sonar-queue claim-next 20 --file src/features/orders

# 3. Open the module files, fix all issues in one pass
#    (Open each file once, fix all its issues)

# 4. Verify each fix locally (typecheck + targeted test)

# 5. Resolve all
sonar-queue resolve KEY1 "Extracted validation to helper"
sonar-queue resolve KEY2 "Added null check"
# ...

# 6. Sync to verify
sonar-queue sync
```

This eliminates context switching — the #1 productivity killer for AI agents.

---

## Golden Rules Recap

1. **Never Slurp** — Use `next`/`status`, never read raw JSON
2. **No Autonomous Scans** — Human runs `scan`; agent works queue
3. **Always Commit State** — `resolve`/`wontfix`/`falsepositive`/`defer` after every fix
4. **File-Cohesive Batches** — Fix all issues in a file together
5. **No Blind Deletions** — Don't delete tests to silence warnings
6. **Empty Queue = Done** — Stop when `next` returns nothing
7. **Error Recovery** — Read stderr, fix, retry; don't ignore errors