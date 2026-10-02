---
name: sonar-scanner
description: 'Systematic SonarQube queue management and batch resolution engine for large & small codebases. Use when analyzing SonarQube findings, claiming prioritized issues, fixing code smells/bugs, or tracking resolution progress without token waste.'
license: MIT
metadata:
  author: engineering
  version: "1.0.0"
---

# /sonar-scanner — Universal SonarQube Resolution Engine

A production-grade, token-optimized protocol for analyzing SonarQube findings, claiming prioritized issues in cohesive batches, and maintaining persistent state across sessions in **any software project**, especially large-scale codebases.

---

## 1. Core Operating Principles

1. **Production Quality over Metric Gaming**:
   * Findings are advisory. Order of priority: **Correctness > Security > Architecture > Maintainability > Sonar score**.
   * Never weaken working architecture or introduce duct-tape workarounds merely to lower issue counts.
2. **Context & Token Conservation (The Zero-Slurp Law)**:
   * **Never slurp raw SonarQube exports into context.** In large projects these span 10,000+ lines.
   * Query only prioritized single-line items via the CLI: `sonar-queue next` (~35 tokens/issue).
3. **No Autonomous Scans**:
   * **Never trigger full scanner runs (`sonar-scanner`) autonomously.**
   * Work strictly off already-exported issues. Scans are triggered by humans or explicit commands.
4. **File-Cohesive Batching (Large Codebase Rule)**:
   * In large codebases, avoid grabbing random issues across disconnected packages.
   * Scope queries by module or file: `sonar-queue next 5 --file <path>`.
   * Resolve all issues in a claimed file during a single edit pass to eliminate context thrashing.
5. **Tiered Risk-Based Local Verification**:
   * **Never run the entire monolithic test suite** for incremental fixes.
   * **Tier 1 (Mandatory)**: Fast typecheck (`npm run typecheck` or `tsc --noEmit`).
   * **Tier 2 (Targeted)**: Run only the unit test corresponding to the edited file (e.g. `npm test -- path/to/File.test.ts`).

---

## 2. CLI Command Quick Reference

Use `npx sonar-queue <command>` (or `npx tsx scripts/sonar-manager/index.ts <command>` if in-repo):

| Command | Scope | Description |
| :--- | :--- | :--- |
| `status [--file <p>]` | Read-only | Dense 2-line summary: Queue lifecycle |
| `next [N] [--file <p>] [--rule <r>] [--severity ]` | Read-only | Peek at next N prioritized pending issues without mutating state |
| `claim <key>` | State mutation | Claim single issue (`pending` $\rightarrow$ `investigating`), increments attempts |
| `claim-next [N] [--file <p>]` | State mutation | Atomically claim next N filtered issues |
| `resolve <key> [notes]` | State mutation | Mark issue as `fixed` (awaiting verification scan) |
| `wontfix <key> <reason>` | State mutation | Mark valid finding accepted by architecture (reason required) |
| `falsepositive <key> <reason>` | State mutation | Mark invalid analyzer finding (reason required) |
| `defer <key> <reason>` | State mutation | Postpone high-risk legacy finding to dedicated epic (reason required) |
| `reset <key>` | State mutation | Revert an `investigating` or `fixed` issue back to `pending` |
| `sync` | State mutation | Fetch lean issues from SonarQube, reconcile queue, detect verified fixes and regressions |

---

## 3. The 7 Issue Lifecycle States

Every tracked issue in `sonarqube-results/agent-state.json` is strictly managed by the CLI:

- `pending`: Discovered in scan, unassigned.
- `investigating`: Actively claimed by agent/developer.
- `fixed`: Source code modified, verified locally, awaiting verification scan.
- `verified`: Confirmed absent/closed in a subsequent SonarQube scan (automatically set by `sync`).
- `wont-fix`: Valid finding intentionally accepted (e.g. protocol contract, architectural exception).
- `false-positive`: Analyzer defect or misinterpretation.
- `deferred`: Valid finding in stable legacy module postponed due to regression blast radius.

> [!IMPORTANT]
> If an issue was marked `fixed`, but a subsequent scan still reports it, `sync` automatically reopens it to `pending`, increments its attempt count, and logs the regression.

---

## 4. Resolution Workflow (Disciplined Batches)

```text
[1. Scope & Query]
  npx sonar-queue next 5 --file <module>
           │
[2. Claim Work]
  npx sonar-queue claim-next 5 --file <module>
           │
[3. Targeted Inspection]
  Read only target file & surrounding lines
           │
[4. Apply Architectural Fix]
  Apply clean pattern, avoid duct-tape patches
           │
[5. Local Tiered Verification]
  npm run typecheck && npm test -- <TargetFile.test.ts>
           │
[6. Advance Queue]
  npx sonar-queue resolve <key> "Summary of fix"
```

### Step-by-Step Execution:

1. **Scope the Batch**:
   - Default batch: `npx sonar-queue next 5 --severity BLOCKER,CRITICAL,MAJOR`
   - Pick a cohesive file or directory:
     ```bash
     npx sonar-queue next 5 --file src/features/orders --severity BLOCKER,CRITICAL
     ```
2. **Claim the Issues**:
   - Claim the batch to lock state:
     ```bash
     npx sonar-queue claim-next 5 --file src/features/orders
     ```
3. **Inspect Target File**:
   - Use your editor or file reading tools to view the exact lines: read from `line - 5` to `line + 5`. Do not guess the context.
   - Check if there are other pending issues in the same file to fix concurrently:
     ```bash
     npx sonar-queue next 10 --file path/to/TargetFile.tsx
     ```
4. **Evaluate & Fix**:
   - *Legitimate defect/smell?* $\rightarrow$ Refactor root cause cleanly.
   - *External API protocol requirement?* $\rightarrow$ `sonar-queue wontfix <key> "Required by third-party API spec"`.
   - *Type already guaranteed by guard/runtime check?* $\rightarrow$ `sonar-queue falsepositive <key> "Guarded upstream"`.
   - *High regression risk in stable legacy code?* $\rightarrow$ `sonar-queue defer <key> "High blast radius; isolate in refactor epic"`.
5. **Verify Locally (Fast Tiers)**:
   - Run typecheck: `npm run typecheck`.
   - Run targeted test if one exists: `npm test -- path/to/Target.test.ts`.
   - Never run full monolithic test suites for individual issue fixes.
6. **Mark Resolved**:
   ```bash
   npx sonar-queue resolve <key> "Extracted helper function to reduce complexity"
   ```
7. **⚠ REQUIRED: Sync & Verify**:
   - After resolving a batch, you MUST run a sync to verify fixes and detect regressions before continuing:
     ```bash
     npx sonar-queue sync
     ```
8. **When Fix Fails (Regression)**:
   - If `sync` reopens an issue, read the regression note in `agent-state.json`, adjust your approach, re-claim, and re-resolve.

---

## 5. Common Rule Solutions (Production Patterns)

| Rule | Finding | Production-Grade Fix |
| :--- | :--- | :--- |
| **S3776** | Cognitive Complexity | Extract cohesive helper functions; replace nested `if/else` with guard clauses or dictionary lookup tables. |
| **S3358** | Nested Ternaries | Replace `a ? b : c ? d : e` with clear `if/else`, `switch`, or constant lookup maps. |
| **S6759** | Component Props Mutable | Mark React component props with `Readonly<Props>` or `readonly` properties. |
| **S1874** | Deprecated APIs | Migrate to the documented modern API replacement. |
| **S2699** | Missing Test Assertions | Add explicit `expect(...)` assertions to tests relying only on non-throwing execution. |
| **S2871** | Alphabetical Sorting | Use `(a, b) => a.localeCompare(b)` instead of default `.sort()` on strings. |
| **S6848 / S6819** | Accessibility / Role | Replace `role="button"` on non-interactive elements with semantic `<button>` elements. |
| **S2245** | Pseudo-Random Numbers | Use `crypto.randomUUID()` or `crypto.getRandomValues()` instead of `Math.random()`. |
| **Unknown Rule** | Any | If rule not in table: search rule key on rules.sonarsource.com, apply minimal fix matching principle #1. |

---

## 6. Golden Rules for Coding Agents

1. **Never Slurp**: Never read raw SonarQube exports. Always use `sonar-queue next` and `status` (~35 tokens/issue).
2. **No Autonomous Scans**: Never run `sonar-scanner` unless explicitly instructed by the user.
3. **Always Commit State**: Always run `resolve`, `wontfix`, `falsepositive`, or `defer` so work is preserved across turns. Keep your `<reason>` concise and under 100 characters (e.g. `'Extracted loop body to private method'`).
4. **File-Cohesive Batches**: Fix multiple issues in the same file together rather than jumping across modules.
5. **No Blind Deletions**: Never delete tests or suppress compiler errors merely to silence Sonar warnings.
6. **Empty Queue**: If `sonar-queue next` returns no pending issues, stop. You have successfully cleared the queue.
7. **Error Recovery**: If a `sonar-queue` command fails (or scanner exits non-zero), read the stderr output, fix your syntax, and try again. Do not silently ignore errors.
