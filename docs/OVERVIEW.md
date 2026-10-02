# Sonar Queue — Project Overview

## What is Sonar Queue?

Sonar Queue is a **local CLI tool and queue management engine** designed for AI coding agents and engineering teams to systematically remediate SonarQube findings. It bridges the gap between SonarQube's static analysis results and an agent's ability to fix them efficiently — without burning LLM context windows or corrupting project state.

## Core Problem It Solves

When AI agents (Claude, Cursor, Codex, etc.) work on SonarQube issues:

| Problem | Sonar Queue Solution |
|---------|---------------------|
| **Token Exhaustion** — Raw `issues.json` files contain thousands of lines (10,000+ tokens per turn) | **~35 tokens/issue** via `sonar-queue next` — dense single-line summaries |
| **Scanner Log Flooding** — Running `sonar-scanner` dumps hundreds of lines of Maven/scanner output | **No autonomous scans** — agents work strictly from queued findings |
| **State Corruption** — Asking agents to update JSON files with `jq` leads to broken formatting, dropped issues, lost tracking | **Strict 7-state lifecycle** with atomic `agent-state.json` writes |
| **No Lifecycle Discipline** — Agents repeat fixes or falsely claim resolution without verification | **Automated regression detection** — `sync` reopens "fixed" issues still present in scan |

## Architecture at a Glance

```
┌─────────────────┐     Lean fetch (7 fields)     ┌──────────────────┐
│   SonarQube     │ ─────────────────────────────► │   sonar-queue    │
│   (Server/Cloud)│  waitForCeTask + /api/issues  │   export.ts      │
└─────────────────┘                                └────────┬─────────┘
                                                            │
                                                            ▼
┌─────────────────┐     Atomic write                  ┌──────────────────┐
│  agent-state.json│ ◄──────────────────────────────── │   sync.ts        │
│  (Single source) │  saveState (temp + rename)      │   Reconcile &    │
└─────────────────┘                                │   verify fixes   │
       ▲                                           └────────┬─────────┘
       │                                                    │
       │  Read-only queries                                │
       ▼                                                    ▼
┌─────────────────┐                              ┌──────────────────┐
│   next.ts       │                              │   status.ts      │
│   claim/next    │                              │   Lifecycle      │
│   resolve, etc. │                              │   summary        │
└─────────────────┘                              └──────────────────┘
```

## Key Design Principles

1. **Zero-Slurp Law** — Never read raw Sonar exports; always query via CLI
2. **No Autonomous Scans** — Humans trigger scans; agents work from queue
3. **File-Cohesive Batching** — Fix all issues in a file together (`--file` filter)
4. **Tiered Verification** — Typecheck + targeted test only, not full suite
5. **Single Source of Truth** — `agent-state.json` only; no intermediate files

## Command Categories

| Category | Commands |
|----------|----------|
| **Setup & Diagnostics** | `init`, `setup`, `doctor` |
| **Infrastructure (Docker)** | `start`, `stop`, `restart`, `docker-status`, `docker-reset` |
| **Analysis** | `scan`, `export` |
| **Queue (Read-only)** | `status`, `next` |
| **Queue (State Mutation)** | `claim`, `claim-next`, `resolve`, `wontfix`, `falsepositive`, `defer`, `reset`, `sync` |

## The 7 Issue Lifecycle States

```
pending ──claim──► investigating ──resolve──► fixed ──sync (verified)──► verified
    │                                                         │
    │                    (regression)                         │
    └───────────────── sync (reopens) ◄──────────────────────┘
    
Terminal states (no auto-transition):
  • wont-fix      — Valid finding, accepted by architecture
  • false-positive — Analyzer error
  • deferred       — Postponed to future sprint
```

## File Structure

```
sonar-queue/
├── index.ts                    # CLI entry point, command dispatch
├── types.ts                    # TypeScript interfaces (IssueStatus, TrackedIssue, AgentState)
├── state.ts                    # loadState/saveState with atomic writes
├── utils/
│   ├── priority.ts             # Severity/type weighting, file extraction, sorting
│   └── scanner.ts              # Shared sonar-scanner detection
├── queue/
│   ├── export.ts               # Fetch lean issues from SonarQube API
│   ├── sync.ts                 # Reconcile scan results → agent-state.json
│   ├── scan.ts                 # Run sonar-scanner with token injection
│   ├── status.ts               # Dense 2-line queue + scan summary
│   ├── next.ts                 # Prioritized pending issues + claim/claim-next
│   ├── resolve.ts              # Mark fixed (awaiting verification)
│   ├── wontfix.ts              # Mark accepted finding
│   ├── falsepositive.ts        # Mark analyzer error
│   ├── defer.ts                # Postpone to future
│   └── reset.ts                # Reset to pending
├── setup/
│   ├── config.ts               # Config resolution (env → JSON → props → .env)
│   ├── detect.ts               # Project stack detection (TS, React, Vite, etc.)
│   ├── docker.ts               # SonarQube + PostgreSQL via Docker Compose
│   ├── doctor.ts               # Full environment diagnostic
│   ├── init.ts                 # Bootstrap config + AI skill
│   ├── wizard.ts               # Interactive setup (token, properties)
│   ├── properties.ts           # Generate sonar-project.properties
│   └── token.ts                # Token validation + server verification
├── templates/
│   ├── SKILL.md                # AI agent protocol (installed via init)
│   ├── sonar-project.properties.template
│   └── .env.sonar.local.template
└── bin/sonar-queue.js          # npm bin wrapper (runs dist or tsx)
```

## Data Flow Summary

1. **`sonar-queue scan`** — Runs `sonar-scanner` with `-Dsonar.token=...`
2. **`sonar-queue export`** — Polls Compute Engine task, then fetches lean issues from `/api/issues/search`
3. **`sonar-queue sync`** — Reconciles:
   - New issues → `pending`
   - Fixed + still open in scan → **reopened**, `attempts++`, regression note
   - Fixed + gone from scan → `verified`
   - Pending/investigating + gone from scan → note "Disappeared from scan"
4. **`sonar-queue next`** — Shows top-N pending issues, sorted by severity → type → file
5. **`sonar-queue claim/claim-next`** — Locks issues to agent (`investigating`, `attempts++`)
6. **`sonar-queue resolve`** — Marks `fixed` (awaiting verification scan)
7. **Repeat** — Agent fixes, `resolve`, then `sync` verifies

## Token Efficiency

| Approach | Tokens per 5 issues |
|----------|---------------------|
| Read `issues.json` directly | ~15,000–40,000 |
| `sonar-queue next 5` | **~35** |

The CLI outputs one line per issue:
```
[AX9z...] CRITICAL BUG | src/auth.ts:42 | typescript:S1234
  Potential null pointer dereference
```

## Configuration Resolution (Priority Order)

1. Environment variables (`SONAR_TOKEN`, `SONAR_HOST_URL`, etc.)
2. `sonar-queue.json` in project root
3. `sonar-project.properties` (`sonar.projectKey`, `sonar.host.url`)
4. `.env.sonar.local` (`SONAR_TOKEN`, `SONAR_HOST_URL`)
5. `package.json` (`name` for project key)
6. Sensible defaults (`http://localhost:9100`, `./sonarqube-results/agent-state.json`)

## Docker Infrastructure

- **`sonar-queue start`** — Provisions SonarQube Community 26.9 + PostgreSQL 15 via Docker Compose
- **`sonar-queue stop`** — Stops containers, preserves volumes
- **`sonar-queue docker-reset`** — Destroys containers + volumes (irreversible)
- Data persisted in `~/.local/share/sonar-queue/`

## AI Agent Integration

The `init` command installs `.agents/skills/sonar-scanner/SKILL.md` — a protocol that teaches agents:
- How to query issues efficiently (`next`, `status`)
- The disciplined batch workflow (Scope → Claim → Inspect → Fix → Verify → Resolve → Sync)
- Golden rules (Never Slurp, No Autonomous Scans, Always Commit State)
- Common Sonar rule fix patterns (S3776, S3358, S6759, etc.)
- Error recovery guidance

## Publishing to npm

```bash
npm run build      # Compiles TypeScript → dist/
npm publish        # Publishes dist/ + bin/ + templates/ + README
```

The package includes:
- `dist/` — Compiled JS + .d.ts
- `bin/sonar-queue.js` — npm bin wrapper
- `templates/` — SKILL.md, property/env templates
- `README.md` — Full usage documentation

## Requirements

- Node.js ≥ 18
- `sonar-scanner` in PATH (for `scan` command)
- Docker + Compose v2 (for `start`/`stop`)
- SonarQube token (Project Analysis Token `sqp_...` recommended)

## License

MIT