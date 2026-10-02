# Documentation Index

## 📚 Documentation Overview

This folder contains comprehensive documentation for Sonar Queue.

---

## 📖 Guides

| Document | Description | Audience |
|----------|-------------|----------|
| [OVERVIEW.md](OVERVIEW.md) | Project architecture, design principles, data flow | All |
| [WORKFLOW_GUIDE.md](WORKFLOW_GUIDE.md) | Step-by-step remediation workflow | Developers, AI Agents |
| [QUICK_REFERENCE.md](QUICK_REFERENCE.md) | One-page command cheatsheet | Daily use |
| [CONFIGURATION.md](CONFIGURATION.md) | Config resolution, env vars, files, patterns | DevOps, Setup |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues, diagnostics, solutions | All |
| [PUBLISHING.md](PUBLISHING.md) | npm publishing process | Maintainers |

---

## 🔧 Technical References

| Document | Description | Audience |
|----------|-------------|----------|
| [API_REFERENCE.md](API_REFERENCE.md) | Complete function/type signatures | Contributors |
| [DATA_MODEL.md](DATA_MODEL.md) | JSON schema, state transitions, fields | Contributors, Integrators |

---

## 🚀 Quick Start Paths

### For AI Agents
1. Read [SKILL.md](../templates/SKILL.md) — your protocol
2. Reference [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for commands
3. Follow [WORKFLOW_GUIDE.md](WORKFLOW_GUIDE.md) phases 1–8

### For Developers (First Time)
1. [OVERVIEW.md](OVERVIEW.md) — Understand the tool
2. [CONFIGURATION.md](CONFIGURATION.md) — Setup project
3. [WORKFLOW_GUIDE.md](WORKFLOW_GUIDE.md) — Learn the loop

### For DevOps / CI/CD
1. [CONFIGURATION.md](CONFIGURATION.md) — Env vars, CI patterns
2. [PUBLISHING.md](PUBLISHING.md) — npm release process
2. [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — Common issues

### For Contributors
1. [API_REFERENCE.md](API_REFERENCE.md) — All functions/types
2. [DATA_MODEL.md](DATA_MODEL.md) — State structure
3. Source code in `../queue/`, `../setup/`, `../utils/`

---

## 🔗 Cross-References

### Commands ↔ Files

| Command | Primary File | Key Functions |
|---------|--------------|---------------|
| `scan` | `queue/scan.ts` | `handleScan` |
| `sync` | `queue/sync.ts` | `handleSync`, `syncOpenIssues`, `reconcileStateIssues` |
| `export` | `queue/export.ts` | `fetchIssuesFromSonar`, `handleExport` |
| `status` | `queue/status.ts` | `handleStatus` |
| `next` | `queue/next.ts` | `handleNext`, `parseFilterOptions` |
| `claim` | `queue/next.ts` | `handleClaim`, `handleClaimNext` |
| `resolve` | `queue/resolve.ts` | `handleResolve` |
| `wontfix` | `queue/wontfix.ts` | `handleWontFix` |
| `falsepositive` | `queue/falsepositive.ts` | `handleFalsePositive` |
| `defer` | `queue/defer.ts` | `handleDefer` |
| `reset` | `queue/reset.ts` | `handleReset` |
| `init` | `setup/init.ts` | `handleInit` |
| `setup` | `setup/wizard.ts` | `handleSetup` |
| `doctor` | `setup/doctor.ts` | `handleDoctor` |
| `start/stop` | `setup/docker.ts` | `handleStart`, `handleStop` |

### Types ↔ Modules

| Type | Defined In | Used By |
|------|------------|---------|
| `IssueStatus` | `types.ts` | All queue modules |
| `SonarIssue` | `types.ts` | `export.ts`, `sync.ts` |
| `TrackedIssue` | `types.ts` | `state.ts`, all queue modules |
| `AgentState` | `types.ts` | `state.ts`, `index.ts` |
| `SonarQueueConfig` | `setup/config.ts` | All modules via `getConfig()` |

---

## 📁 Source Code Structure

```
sonar-queue/
├── index.ts                    # CLI entry, command dispatch
├── types.ts                    # Core type definitions
├── state.ts                    # loadState/saveState (atomic)
├── utils/
│   ├── priority.ts             # Severity/type weights, sorting
│   └── scanner.ts              # sonar-scanner detection
├── queue/
│   ├── export.ts               # Fetch lean issues from SonarQube
│   ├── sync.ts                 # Reconcile + verify fixes
│   ├── scan.ts                 # Run sonar-scanner
│   ├── status.ts               # Queue summary
│   ├── next.ts                 # Prioritized issues + claim
│   ├── resolve.ts              # Mark fixed
│   ├── wontfix.ts              # Accept finding
│   ├── falsepositive.ts        # Mark analyzer error
│   ├── defer.ts                # Postpone
│   └── reset.ts                # Back to pending
├── setup/
│   ├── config.ts               # Config resolution (cascading)
│   ├── detect.ts               # Stack detection (TS, React, etc.)
│   ├── docker.ts               # SonarQube + PG via Compose
│   ├── doctor.ts               # 13 checks across 6 categories
│   ├── init.ts                 # Bootstrap + AI skill install
│   ├── wizard.ts               # Interactive setup
│   ├── properties.ts           # sonar-project.properties gen
│   └── token.ts                # Token validation + server verify
├── templates/
│   ├── SKILL.md                # AI agent protocol
│   ├── sonar-project.properties.template
│   └── .env.sonar.local.template
└── bin/sonar-queue.js          # npm bin wrapper
```

---

## 🔄 Data Flow Diagram

```
┌──────────────┐     scan      ┌──────────────┐     sync      ┌──────────────────┐
│   Source     │ ────────────► │  SonarQube   │ ────────────► │  agent-state.json│
│   Code       │  sonar-scanner│  (analyze)   │  fetch+reconcile│  (single truth)  │
└──────────────┘               └──────────────┘                └────────┬─────────┘
                                                                        │
                        ┌───────────────────────────────────────────────┘
                        ▼
              ┌─────────────────┐     ┌─────────────────┐
              │   next/claim    │────►│   fix + resolve │
              │   (view queue)  │     │   (modify code) │
              └─────────────────┘     └────────┬────────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │    sync      │
                                        │ (verify/fix)  │
                                        └──────────────┘
```

---

## 📝 Maintainer Notes

### Adding a New Command
1. Create `queue/newcommand.ts` with `handleNewCommand`
2. Export from `index.ts`
3. Add to `COMMANDS` registry
4. Add to help text in `printHelp()`
5. Update SKILL.md if agent-facing
3. Add docs in `docs/`

### Modifying State Schema
1. Update `TrackedIssue` in `types.ts`
2. Update `calculateSummary` in `state.ts`
3. Handle migration in `loadState()`
4. Update `DATA_MODEL.md`

### Changing Config Resolution
1. Modify `getConfig()` in `setup/config.ts`
2. Update `CONFIGURATION.md`
3. Test with `sonar-queue doctor`

---

## 📄 License

MIT — See [LICENSE](../LICENSE) in project root.