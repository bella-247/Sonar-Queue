# Sonar Queue

<div align="center">

**A systematic AI agent remediation engine and local developer tool for SonarQube.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: >=18](https://img.shields.io/badge/Node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-orange.svg)](package.json)

*Token-efficient queue management, claim tracking, Docker container orchestration, and automated fix verification for AI agents and engineering teams.*

</div>

---

## ⚡ The Problem

When coding agents (Claude, Cursor, OpenCode, Antigravity) work directly with SonarQube, two major bottlenecks emerge:

1. **Context Window Flooding (The Token Tax)**:
   A standard SonarQube analysis export contains hundreds of issues with ~30 metadata fields each (flows, hashes, debt, AST locations). Ingesting this burns **30,000–50,000 tokens** per turn, causing inference latency spikes, high API costs, and context amnesia.
2. **Missing Remediation Lifecycle**:
   SonarQube is an *analysis engine*, not a *workflow coordinator*. It has no server-side concept of:
   - Who claimed an issue (`investigating`)
   - How many fix attempts have occurred (`attempts: 2`)
   - Issues pending verification (`awaiting-scan`)
   - Postponing legacy refactors (`defer`)
   - True verification (checking if a fix actually resolved the issue after a rescan)

---

## 🎯 The Solution: Sonar Queue

`sonar-queue` sits between SonarQube and your coding agent as a **local remediation workflow engine**:

```text
 ┌───────────────────────┐
 │ SonarQube Server/Cloud│  Analysis Truth (Issues, Rules, Metrics)
 └───────────┬───────────┘
             │ Lean ~7-field fetch
             ▼
 ┌───────────────────────┐
 │      SONAR QUEUE      │  Remediation Truth (agent-state.json)
 │  • Priority Heuristic │  - File-cohesion & severity sorting
 │  • Claim & Lock       │  - Tracks attempts, timestamps, notes
 │  • Zero-Slurp Engine  │  - Formats issues into dense ~35-token lines
 │  • Verification Loop  │  - Reconciles fixes, auto-reopens regressions
 │  • Docker Lifecycle   │  - Compose + PostgreSQL 15 orchestrator
 └───────────┬───────────┘
             │ Dense ~35 tokens/issue
             ▼
 ┌───────────────────────┐
 │  AI Agent / Developer │  (Cursor, Claude Desktop, Terminal, CI)
 └───────────────────────┘
```

- **98% Token Reduction (The Zero-Slurp Law)**: Instead of multi-megabyte JSON dumps, issues are served in prioritized ~35-token lines.
- **File-Cohesive Grouping**: Groups issues by source file so agents fix entire files in a single pass, eliminating context thrashing.
- **7-State Lifecycle**: `pending` → `investigating` → `fixed` → `verified`, with explicit audit tracking for `wont-fix`, `false-positive`, and `deferred`.
- **Automated Regression Reopening**: If code is modified and marked `fixed`, but the next scan still detects the violation, `sonar-queue` automatically reopens the issue (`attempts += 1`) and logs the regression.
- **Turnkey Docker Stack**: Built-in Docker Compose + PostgreSQL 15 manager to spin up a local SonarQube instance with persistent storage in seconds.

---

## 🚀 Quick Start

### 1. Check Environment Health
```bash
npx sonar-queue doctor
```
Verifies your OS, Node.js (>=18), Docker, Docker Compose, SonarScanner CLI, and network reachability.

### 2. Start Local SonarQube (Optional)
If you don't have a SonarQube instance running:
```bash
npx sonar-queue start
```
Spawns an isolated SonarQube Community + PostgreSQL 15 container at `http://localhost:9100` with data stored safely in `~/.local/share/sonar-queue/`.

### 3. Initialize & Configure Your Project
Run in your project root:
```bash
npx sonar-queue setup
```
The interactive wizard:
- Auto-detects your stack (TypeScript, React, Vite, Vitest, Jest, etc.).
- Prompts for your project key, project name, and SonarQube token (`sqp_...`).
- Validates the token against the live server.
- Generates tailored `sonar-project.properties` and `.env.sonar.local`.

*(Alternatively, run `npx sonar-queue init` for non-interactive template bootstrapping).*

### 4. Scan & Sync Live Issues
```bash
# Run SonarScanner with automatic token injection
npx sonar-queue scan

# Reconcile scan results into the local queue
npx sonar-queue sync
```

---

## 🔄 The Remediation Workflow

### 1. View Status
```bash
npx sonar-queue status
```
```text
Issues: 12 active (2 blocker, 4 major | 6 code_smell), 5 verified
Queue:  8 pending, 2 investigating, 2 fixed, 5 verified, 0 wont-fix, 0 fp, 0 deferred (17 total)
```

### 2. Peek & Claim Prioritized Issues
```bash
# View the next 5 prioritized issues
npx sonar-queue next 5

# View next issues in a specific file
npx sonar-queue next 5 --file src/auth/login.ts

# Claim the highest-priority issue
npx sonar-queue claim AX123456789
```
Output:
```text
[AX123456789] CRITICAL BUG | src/auth/login.ts:42 | typescript:S1874 (attempt #1)
  'deprecatedAuthMethod' is deprecated and will be removed in next major release.
```

### 3. Fix Code & Mark Resolved
Once the agent or developer fixes the code locally:
```bash
npx sonar-queue resolve AX123456789 "Migrated to new authProvider API"
```

*(Or mark with audited justifications:)*
```bash
npx sonar-queue wontfix AX123456789 "Architectural decision approved in ADR-042"
npx sonar-queue falsepositive AX123456789 "Static analyzer misinterprets type narrowing"
npx sonar-queue defer AX123456789 "Requires database schema migration in Q3"
```

### 4. Verify Fixes
Run a fresh scan and sync:
```bash
npx sonar-queue scan && npx sonar-queue sync
```
- **If fixed**: Automatically marked `verified`!
- **If regression occurs**: Automatically reopened with `[Reopened] Attempt #2 failed: still open in scan.`

---

## 📖 CLI Command Reference

### Setup & Diagnostics
| Command | Description |
| :--- | :--- |
| `sonar-queue doctor` | Comprehensive diagnostic check of Node, Docker, containers, scanner CLI, and credentials |
| `sonar-queue setup` | Interactive project onboarding wizard (auto-stack detection & token validation) |
| `sonar-queue init [--force]` | Non-interactive bootstrapper (installs templates & AI skill) |

### Infrastructure (Docker Compose + PostgreSQL)
| Command | Description |
| :--- | :--- |
| `sonar-queue start` | Start SonarQube + PostgreSQL 15 containers via Docker Compose |
| `sonar-queue stop` | Stop containers (all persistent data preserved) |
| `sonar-queue restart` | Restart containers |
| `sonar-queue docker-status` | Display container health and uptime |
| `sonar-queue docker-reset` | ⚠ Irreversibly destroy all containers and volumes (requires confirmation) |

### Analysis & Sync
| Command | Description |
| :--- | :--- |
| `sonar-queue scan [...args]` | Execute `sonar-scanner` with automatic token injection |
| `sonar-queue sync` | Wait for server CE task and reconcile live issues into `agent-state.json` |
| `sonar-queue export` | Fetch lean issues from SonarQube and sync directly to queue |

### Queue & Remediation
| Command | Description |
| :--- | :--- |
| `sonar-queue status [--file <p>]` | Dense 2-line dual summary of active issues and remediation queue state |
| `sonar-queue next [N] [--file <p>]` | Peek at next N prioritized pending issues without mutating state |
| `sonar-queue claim <key>` | Claim an issue (`pending` $\rightarrow$ `investigating`), increments attempt counter |
| `sonar-queue claim-next [N]` | Atomically claim next N filtered issues |
| `sonar-queue resolve <key> [note]` | Mark issue fixed (transitions to awaiting verification) |
| `sonar-queue wontfix <key> <reason>` | Mark wont-fix locally with mandatory technical audit reason |
| `sonar-queue falsepositive <key> <res>` | Mark false-positive locally with mandatory reason |
| `sonar-queue defer <key> <reason>` | Defer issue to future milestone with reason |
| `sonar-queue reset <key>` | Revert an `investigating` or `fixed` issue back to `pending` |

---

## 🤖 AI Agent Integration

`sonar-queue init` automatically installs an agent skill at:
```text
.agents/skills/sonar-scanner/SKILL.md
```
This skill works natively with **Cursor**, **Claude Code**, **OpenCode**, and **Antigravity**. It instructs agents to:
- Enforce the **Zero-Slurp Law** (never read entire state dumps).
- Query prioritized issues file-by-file (`sonar-queue next 5 --file <path>`).
- Run targeted local tests before declaring an issue fixed.
- Resolve issues systematically through the queue CLI.

---

## 📊 Token Efficiency: Raw Sonar vs. Sonar Queue

| Metric | Raw SonarQube JSON / MCP | Sonar Queue CLI |
| :--- | :--- | :--- |
| **Payload per issue** | ~30 fields (AST ranges, debt, hashes) | **7 fields** (`key`, `rule`, `file`, `line`, `severity`, `type`, `message`) |
| **Tokens for 20 issues** | ~12,000 – 18,000 tokens | **~700 tokens** (96% savings) |
| **Remediation State** | ❌ None (stateless) | ✅ Claims, attempts, timestamps, notes |
| **Regression Detection**| ❌ Manual | ✅ Automated post-scan verification |
| **Grouping Heuristic** | ❌ Arbitrary database order | ✅ Priority sort by severity + file cohesion |

---

## 📄 License

[MIT](LICENSE) © 2026 Abel Mekonen
