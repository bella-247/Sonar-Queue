# Quick Reference Card

## Core Commands

```bash
# Setup
sonar-queue init              # Bootstrap config + AI skill
sonar-queue setup             # Interactive wizard
sonar-queue doctor            # Full diagnostics

# Infrastructure (Docker)
sonar-queue start             # Start SonarQube + PostgreSQL
sonar-queue stop              # Stop (preserve data)
sonar-queue restart           # Restart
sonar-queue docker-status     # Show container status
sonar-queue docker-reset      # ⚠ Destroy all data

# Analysis
sonar-queue scan              # Run sonar-scanner (auto token)
sonar-queue sync              # Fetch + reconcile + verify (MAIN COMMAND)

# Queue (Read-only)
sonar-queue status [--file]   # Queue summary
sonar-queue next [N] [filters] # View pending issues

# Queue (State mutation)
sonar-queue claim <key>              # Lock single issue
sonar-queue claim-next [N] [filters] # Lock batch
sonar-queue resolve <key> [notes]    # Mark fixed
sonar-queue wontfix <key> <reason>   # Accept finding
sonar-queue falsepositive <key> <r>  # Analyzer error
sonar-queue defer <key> <reason>     # Postpone
sonar-queue reset <key>              # Back to pending
```

---

## Filter Options (for `next` / `claim-next`)

| Flag | Short | Example |
|------|-------|---------|
| `--file <path>` | `-f` | `--file src/auth` |
| `--rule <key>` | `-r` | `--rule S3776` |
| `--severity <list>` | `-s` | `--severity BLOCKER,CRITICAL` |
| `--type <type>` | `-t` | `--type BUG` |
| `<N>` | — | `next 10` (default 5) |

---

## Standard Workflow

```bash
# 1. Scan
sonar-queue scan

# 2. Sync (fetches + reconciles + verifies)
sonar-queue sync

# 3. Pick batch (file-cohesive)
sonar-queue next 5 --file src/auth --severity BLOCKER,CRITICAL

# 4. Claim
sonar-queue claim-next 5 --file src/auth

# 5. Fix (read exact lines, fix all in file)
# cat -n src/auth/login.ts | sed -n '37,47p'

# 6. Verify locally
npm run typecheck && npm test -- src/auth/login.test.ts

# 7. Resolve
sonar-queue resolve KEY "Extracted null check to guard clause"

# 8. Sync to verify (REQUIRED)
sonar-queue sync

# Repeat until: "No pending issues."
```

---

## Issue Lifecycle

```
pending ──claim──► investigating ──resolve──► fixed ──sync──► verified
    │                │                      │
    │                │                      │ (regression)
    │                │                      ▼
    │                │                 pending (attempts++)
    │                │
    └────────────────┴── reset
    
Terminal: wont-fix, false-positive, deferred
```

---

## Key Files

| File | Purpose |
|------|---------|
| `sonarqube-results/agent-state.json` | **Single source of truth** |
| `sonar-project.properties` | SonarScanner config |
| `.env.sonar.local` | Secrets (token, URL) — **never commit** |
| `.agents/skills/sonar-scanner/SKILL.md` | AI agent protocol |

---

## Environment Variables

| Variable | Default |
|----------|---------|
| `SONAR_TOKEN` | From `.env.sonar.local` |
| `SONAR_HOST_URL` | `http://localhost:9100` |
| `SONAR_PROJECT_KEY` | Auto-detected |
| `SONAR_RESULTS_DIR` | `./sonarqube-results` |
| `SONAR_STATE_FILE` | `<resultsDir>/agent-state.json` |

---

## Token Types

| Prefix | Type | Use |
|--------|------|-----|
| `sqp_` | **Project Analysis Token** | **Recommended** |
| `squ_` | User Token | Your permissions |
| `sqa_` | Global Analysis Token | Multi-project |

---

## Common Sonar Rules Quick Fixes

| Rule | Finding | Fix |
|------|---------|-----|
| S3776 | Cognitive Complexity | Extract helper functions |
| S3358 | Nested Ternaries | Replace with if/else or lookup map |
| S6759 | Mutable Props | Add `Readonly<Props>` |
| S1874 | Deprecated API | Migrate to modern replacement |
| S2699 | Missing Assertions | Add explicit `expect()` |
| S2871 | Alphabetical Sort | Use `.sort((a,b)=>a.localeCompare(b))` |
| S6848/S6819 | Accessibility | Use semantic `<button>` |
| S2245 | Pseudo-Random | Use `crypto.randomUUID()` |

---

## Debug Commands

```bash
sonar-queue doctor                    # Full diagnostics
sonar-queue scan -X                   # Verbose scanner
DEBUG=sonar-queue:* sonar-queue sync  # Debug sync
cat sonarqube-results/agent-state.json | jq  # Inspect state
```

---

## .gitignore Essentials

```
sonarqube-results/*
!sonarqube-results/agent-state.json  # Commit this!
.scannerwork/
.env.sonar.local
*.tgz
```

---

## Golden Rules for Agents

1. **Never Slurp** — Use `next`/`status` (~35 tokens/issue)
2. **No Autonomous Scans** — Human runs `scan`
3. **Always Commit State** — `resolve`/`wontfix`/`falsepositive`/`defer`
4. **File-Cohesive Batches** — Fix all issues in a file together
5. **No Blind Deletions** — Don't delete tests to silence warnings
6. **Empty Queue = Done** — Stop when `next` returns nothing
7. **Error Recovery** — Read stderr, fix, retry

---

## Support

```bash
sonar-queue help           # This help
sonar-queue doctor         # Diagnostics
# GitHub Issues for bugs
```