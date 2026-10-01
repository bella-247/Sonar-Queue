# Changelog

All notable changes to sonar-queue are documented here.

Format: [Semantic Versioning](https://semver.org/). Sections: Added, Changed, Fixed, Removed.

---

## [1.1.0] — Unreleased

### Added
- `doctor` command: checks Node.js version, `sonar-project.properties`, sonar-scanner in PATH, Docker presence, SonarQube container status, server reachability, and token validity
- `start` command: creates and starts a local SonarQube Docker container with named data/logs/extensions volumes (persistent across restarts)
- `stop` command: gracefully stops SonarQube container without destroying data volumes
- `--type` filter on `next` and `claim-next` (e.g. `--type BUG`)
- Dense 1-line-per-issue format for `export` report.md (replaces verbose 7-line blocks — critical for large codebases)

### Changed
- `help` output reorganized into logical sections: Setup, Infrastructure, Data, Queue
- `export` report.md now generates a summary header (`Total: N | X critical, Y major | A bug, B code_smell`) followed by dense `[KEY] SEV TYPE | file:line | rule — message` lines

### Fixed
- Docker container filter now uses exact name match to avoid matching `sonarqube-db` alongside `sonarqube`
- SonarQube ping check is now HTTP-status-aware (SonarQube 10.x returns HTTP 200 with empty body, not `pong`)

---

## [1.0.0] — 2026-10-01

### Added
- Full 7-state issue lifecycle: `pending` → `investigating` → `fixed` → `verified`, plus `wont-fix`, `false-positive`, `deferred`
- `init [--force]`: bootstraps `sonar-project.properties`, `.env.sonar.local.example`, AI skill, and `.gitignore` entries with full idempotency
- `export`: paginated SonarQube REST API fetch with metrics and quality gate
- `sync`: reconciles scan results into queue state, auto-reopens regressions
- `status [--file]`: dense 2-line dual summary (scan breakdown + queue lifecycle)
- `next [N] [--file] [--rule] [--severity]`: token-optimized prioritized issue view
- `claim`, `claim-next`, `resolve`, `wontfix`, `falsepositive`, `defer`, `reset`: full lifecycle commands
- AI agent skill template (`SKILL.md`) installed into `.agents/skills/sonar-scanner/`
- Config auto-discovery from `sonar-project.properties`, `.env.sonar.local`, `sonar-queue.json`, and environment variables
- Cross-platform Node.js implementation (no shell dependencies)
