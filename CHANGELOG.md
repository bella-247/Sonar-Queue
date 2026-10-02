# Changelog

All notable changes to sonar-queue are documented here.

Format: [Semantic Versioning](https://semver.org/). Sections: Added, Changed, Fixed, Removed.

---

## [1.0.0] — 2026-10-02

### Added
- **Full 7-state issue lifecycle**: `pending` → `investigating` → `fixed` → `verified`, plus audited `wont-fix`, `false-positive`, and `deferred` states.
- **Zero-Slurp token-optimized issue inspection**: `next` and `claim-next` with `--file`, `--rule`, `--severity`, and `--type` filtering (~35 tokens per issue).
- **Automated regression reopening**: Sync reconciles live scan results, auto-detects unverified fixes, increments attempt counts, and logs regressions.
- **Interactive project wizard (`setup`)**: Automatically detects stack (TypeScript, React, Next.js, Jest, Vitest, Python, Go, Java), tests SonarQube credentials live, and writes configuration.
- **Non-interactive bootstrapper (`init`)**: Installs templates and agent protocol with `--force` support.
- **Environment & health diagnostics (`doctor`)**: Validates Node.js (>=18), Docker, Compose, SonarScanner CLI, network reachability, and auth tokens.
- **Docker Compose & PostgreSQL manager**: `start`, `stop`, `restart`, `docker-status`, and `docker-reset` for seamless local SonarQube orchestration with persistent storage.
- **SonarScanner execution (`scan`)**: Runs analysis with automatic local credential and configuration injection.
- **Export & reporting (`export`)**: Fetches lean SonarQube findings and generates a dense single-line markdown summary report.
- **AI Agent Skill protocol (`SKILL.md`)**: Production-grade resolution instructions tailored for Claude, Cursor, Antigravity, and OpenCode.
- **Zero runtime dependencies**: Pure Node.js standard library implementation.
