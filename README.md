# Sonar-Queue — Token-Optimized SonarQube Queue & AI Remediation Engine

A production-grade CLI and queue management engine designed for AI coding agents and engineering teams to remediate SonarQube findings systematically, without blowing up LLM context windows or corrupting project state.

---

## ⚡ The Problem Sonar-Queue Solves

When AI coding agents (Claude, Antigravity, Cursor, Codex) work on SonarQube issues:
1. **Token Exhaustion**: Raw Sonar output files (`issues.json`, `report.md`) often contain thousands of lines. An agent reading these directly burns tens of thousands of tokens per turn.
2. **Scanner Log Slurping**: Running `sonar-scanner` CLI autonomously floods the conversation with hundreds of lines of maven/scanner output.
3. **State Corruption & Lost Progress**: Asking agents to update JSON files with `jq` or ad-hoc scripts leads to broken formatting, dropped issues, and lost tracking when sessions reset.
4. **No Lifecycle Discipline**: Without explicit issue states, agents repeat fixes on the same issues or falsely claim resolution without verification.

---

## 🎯 How Sonar-Queue Solves It

```text
  SonarQube Server (Local / Remote)
                │
                ▼ (REST API / export)
      sonarqube-results/issues.json
                │
                ▼ (reconcile / priority sort)
        [sonar-queue CLI]
                │
    ┌───────────┴───────────┐
    ▼                       ▼
Ultra-Dense CLI Views   Persistent Queue Lifecycle
"next 5" (1 line/issue)  pending → investigating → fixed → verified
"status" (2-line total)     └── [reopen if scan fails]
```

- **90% Token Reduction**: Issues are queried in prioritized single-line summaries (`[KEY] CRITICAL BUG | file:line | rule`). Status is a dense 2-line dual summary.
- **Strict 7-State Lifecycle**: `pending` → `investigating` → `fixed` → `verified`, plus documented exceptions: `wont-fix`, `false-positive`, `deferred`.
- **Automated Regression Reopening**: If an agent marks an issue `fixed`, but a subsequent scan still reports it, the issue is automatically reopened to `pending`, attempts are incremented, and failure notes are appended.
- **Zero Autonomous Scans**: Agents work strictly from the queued findings. Scans are run by humans or explicitly requested.

---

## 🚀 Quick Start (In Any Project)

### 1. Initialize in a New Project
Run inside any project root:

```bash
npx tsx path/to/sonar-manager/index.ts init
# or if installed as npm package:
# npx sonar-queue init
```

This bootstraps:
- `sonar-project.properties` (with clean defaults for your project)
- `.env.sonar.local.example` (for your SonarQube token and host)
- `.agents/skills/sonar-scanner/SKILL.md` (AI agent skill instructions)
- `.gitignore` entries for `.scannerwork/` and `.env.sonar.local`
- `sonarqube-results/` directory

### 2. Configure Token
Copy `.env.sonar.local.example` to `.env.sonar.local`:
```bash
cp .env.sonar.local.example .env.sonar.local
```
Add your SonarQube user token:
```ini
SONAR_TOKEN=sqp_your_personal_token_here
SONAR_HOST_URL=http://localhost:9100
```

### 3. Export Scan Results & Sync
After running your project's SonarQube scan:
```bash
# Fetch from SonarQube API directly (pure TypeScript, cross-platform)
npx sonar-queue export

# Reconcile issues into queue state
npx sonar-queue sync
```

---

## 📖 CLI Commands Reference

| Command | Scope | Description |
| :--- | :--- | :--- |
| `init` | Setup | Bootstrap SonarQube configuration and AI agent skill in the current project |
| `export` | Network | Fetch issues, metrics, and quality gate directly from SonarQube REST API |
| `sync` | State | Reconcile scan results into `agent-state.json`, detecting verified fixes and regressions |
| `status [--file <path>]` | Read-only | Show 2-line dual summary (optionally scoped to a path or module) |
| `next [N] [--file <p>] [--rule <r>] [--severity <s>]` | Read-only | View next N prioritized pending issues (supports file, rule, severity filters) |
| `claim <key>` | State | Explicitly claim an issue (transitions `pending` $\rightarrow$ `investigating`) |
| `claim-next [N] [--file <p>] [--rule <r>]` | State | Claim the next N prioritized issues matching filter |
| `resolve <key> [notes]` | State | Mark issue as `fixed` (awaiting verification scan) |
| `wontfix <key> <reason>` | State | Mark issue as `wont-fix` (technical justification required) |
| `falsepositive <key> <res>` | State | Mark issue as `false-positive` (technical justification required) |
| `defer <key> <reason>` | State | Mark issue as `deferred` (technical justification required) |
| `reset <key>` | State | Reset an `investigating` or `fixed` issue back to `pending` |

---

## ⚙️ Configuration & Environment Variables

Sonar-Queue auto-discovers settings from:
1. `sonar-project.properties` in project root (`sonar.projectKey`, `sonar.projectName`, `sonar.host.url`)
2. `.env.sonar.local` in project root (`SONAR_TOKEN`, `SONAR_HOST_URL`, `SONAR_PROJECT_KEY`)
3. Optional `sonar-queue.json` in project root
4. Environment variables:

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `SONAR_PROJECT_KEY` | Auto-detected from properties/package.json | SonarQube project key |
| `SONAR_PROJECT_NAME`| Auto-detected from properties | Display name |
| `SONAR_HOST_URL` | `http://localhost:9100` | SonarQube server URL |
| `SONAR_TOKEN` | Read from `.env.sonar.local` | SonarQube user authentication token |
| `SONAR_RESULTS_DIR` | `./sonarqube-results` | Output directory for issue data |
| `SONAR_PROJECT_ROOT`| Auto-detected from `.git` / properties | Project root directory |

---

## 📦 How to Extract into a Standalone Repository

To extract this tool into its own GitHub repository (e.g. `github.com/your-username/sonar-queue`):

```bash
# 1. Create a new directory or repo
mkdir sonar-queue && cd sonar-queue

# 2. Copy the scripts/sonar-manager contents
cp -r /path/to/flavour-bites/scripts/sonar-manager/* .

# 3. Initialize git and install dependencies
git init
npm install -D tsx typescript @types/node

# 4. Build or publish
npm run build
npm publish --access public  # or use via git repository
```

Once extracted or published, any project can use it immediately:
```bash
npx sonar-queue init
npx sonar-queue status
```

---

## 🤖 AI Agent Workflow

When pairing with AI coding agents:
1. Agent reads `npx sonar-queue next 5` (costs ~100 tokens, not 5,000).
2. Agent claims an issue: `npx sonar-queue claim <key>`.
3. Agent reads only the target source file around the specified line number.
4. Agent applies architectural fix and verifies locally (`npm run typecheck && npm test`).
5. Agent marks resolved: `npx sonar-queue resolve <key> "Refactored to reduce complexity"`.
6. Human runs scan when ready $\rightarrow$ `npx sonar-queue export && npx sonar-queue sync` verifies fixes.
