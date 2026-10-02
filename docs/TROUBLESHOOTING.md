# Troubleshooting Guide

## Quick Diagnostics

Run the built-in doctor first — it checks everything:

```bash
sonar-queue doctor
```

Output shows ✓/✗ for 13 checks across 6 categories.

---

## Common Issues

### 1. SONAR_TOKEN Issues

#### "SONAR_TOKEN is not configured"
```bash
# Check file exists
cat .env.sonar.local

# Should contain:
SONAR_TOKEN=sqp_your_token_here
SONAR_HOST_URL=http://localhost:9100

# If missing, create it:
cp .env.sonar.local.example .env.sonar.local
# Then edit with real token
```

#### "Token rejected by server" / "HTTP 401/403"
```bash
# Token expired or invalid
# 1. Verify in SonarQube: Project Settings → Analysis Tokens
# 2. Regenerate if needed
# 3. Update .env.sonar.local
# 4. Test:
sonar-queue doctor
```

#### "Invalid token prefix"
```bash
# Must start with: sqp_ (project), squ_ (user), or sqa_ (global)
# Check:
echo $SONAR_TOKEN | head -c 4
# Should output: sqp_ or squ_ or sqa_
```

#### "Server not reachable" (token format accepted)
```bash
# SonarQube not running
sonar-queue start
# Wait 30-60s, then:
sonar-queue doctor
```

---

### 2. SonarScanner Issues

#### "sonar-scanner not found in PATH"
```bash
# Install SonarScanner
# https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/scanners/sonarscanner/

# Linux/macOS (Homebrew):
brew install sonar-scanner

# Linux (manual):
wget https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-5.0.1.3006-linux.zip
unzip sonar-scanner-cli-*.zip
export PATH=$PATH:/path/to/sonar-scanner-5.0.1.3006-linux/bin

# Windows (Chocolatey):
choco install sonarscanner

# Verify:
sonar-scanner --version
sonar-queue doctor
```

#### "Scanner exits with non-zero"
```bash
# Run with verbose output:
sonar-queue scan -X

# Common causes:
# - Wrong project key in sonar-project.properties
# - Missing sonar.sources
# - Network timeout to SonarQube
# - Token lacks permissions
```

---

### 3. Docker Issues

#### "Docker not found in PATH"
```bash
# Install Docker Desktop / Docker Engine
# https://docs.docker.com/engine/install/

# Verify:
docker --version
docker compose version
```

#### "Docker daemon not running"
```bash
# Linux:
sudo systemctl start docker

# macOS/Windows: Start Docker Desktop app
```

#### "Docker Compose not available"
```bash
# Docker Compose v2 included with Docker Desktop
# Linux: install docker-compose-plugin
sudo apt-get install docker-compose-plugin

# Verify:
docker compose version
```

#### "Port 9100 already in use"
```bash
# Change port in .env.sonar.local:
SONAR_HOST_URL=http://localhost:9200

# Restart:
sonar-queue restart

# Or find what's using 9100:
lsof -i :9100
# Kill if needed
```

#### "SonarQube container won't start"
```bash
# Check logs:
docker logs sonarqube

# Common issues:
# - Not enough memory (needs ~2GB)
# - Elasticsearch bootstrap checks failed
# - Port conflict

# Increase Docker memory (Docker Desktop → Resources → Advanced)
```

#### "PostgreSQL container unhealthy"
```bash
# Check logs:
docker logs sonarqube-db

# Usually: password mismatch or volume corruption
# Fix: sonar-queue docker-reset (destroys data!)
```

---

### 4. Sync Issues

#### "Synced: 0 new, 0 verified" but issues exist in SonarQube
```bash
# Check project key matches
sonar-queue doctor
# Look at "Project" section → projectKey

# Verify token has access to project
# Project token (sqp_) only works for its project
# User token (squ_) works for all your projects
```

#### "Synced: X reopened" — Regression detected
```bash
# This is EXPECTED behavior — a fix didn't work
# 1. Check agent-state.json for regression notes
cat sonarqube-results/agent-state.json | jq '.issues."KEY".notes'

# 2. Re-claim and fix properly:
sonar-queue claim KEY
# ... fix properly ...
sonar-queue resolve KEY "Fixed properly this time"
sonar-queue sync
```

#### "Issue disappeared from scan" note
```bash
# Issue was pending/investigating but not in latest scan
# Causes:
# - File was deleted/excluded
# - Rule was disabled
# - Scan was partial (incremental)

# Check sonar-project.properties exclusions
# Check if file still exists
```

#### "agent-state.json corrupted" / "Unexpected token"
```bash
# Backup and reset:
mv sonarqube-results/agent-state.json sonarqube-results/agent-state.json.bak
sonar-queue sync  # Rebuilds from SonarQube
```

---

### 5. Project Config Issues

#### "Project root not found"
```bash
# Must be in a directory with one of:
# - sonar-project.properties
# - .env.sonar.local
# - package.json
# - .git
# - sonar-queue.json

# Or set explicitly:
export SONAR_PROJECT_ROOT=/path/to/project
```

#### "Wrong project key in SonarQube"
```bash
# Check what config resolves to:
sonar-queue doctor
# Look at "Project" section

# Verify sonar-project.properties:
cat sonar-project.properties | grep sonar.projectKey
```

#### ".env.sonar.local not found"
```bash
# Create from example:
cp .env.sonar.local.example .env.sonar.local
# Edit with real token
```

---

### 6. CLI Issues

#### "Unknown command"
```bash
# Check available commands:
sonar-queue help

# Common typos:
# sonar-queue export → sonar-queue sync (export is deprecated/alias)
# sonar-queue export → now just calls sync internally
```

#### "Command not found: sonar-queue"
```bash
# Install globally:
npm install -g sonar-queue

# Or use npx:
npx sonar-queue <command>

# Or from source:
npx tsx /path/to/sonar-queue/index.ts <command>
```

#### "TypeScript errors" when running from source
```bash
# Ensure dependencies installed:
npm install

# Typecheck:
npm run typecheck

# Build:
npm run build
```

---

### 7. Network/Proxy Issues

#### Behind corporate proxy
```bash
# Set proxy for fetch (Node 18+):
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080

# Or configure in .env.sonar.local (not standard, but some tools respect):
# HTTP_PROXY=http://proxy.company.com:8080
```

#### Self-signed certificates
```bash
# Disable TLS verification (INSECURE - dev only):
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Better: add CA to trust store
```

---

### 8. Permission Issues

#### "EACCES" / "Permission denied"
```bash
# .env.sonar.local should be 0600:
chmod 600 .env.sonar.local

# Results dir:
chmod -R u+rw sonarqube-results/

# If running as different user (CI):
# Ensure same user owns the directory
```

---

## Debug Mode

Enable verbose logging:

```bash
# For scan (shows scanner output):
sonar-queue scan -X

# For sync (shows fetch details):
DEBUG=sonar-queue:* sonar-queue sync

# For doctor (shows all check details):
sonar-queue doctor
```

---

## Log Locations

| Component | Location |
|-----------|----------|
| SonarQube logs | `docker logs sonarqube` |
| PostgreSQL logs | `docker logs sonarqube-db` |
| Scanner output | stdout/stderr of `sonar-queue scan` |
| Agent state | `sonarqube-results/agent-state.json` |
| Scanner temp | `.scannerwork/` (gitignored) |

---

## Getting Help

1. **Run doctor** — `sonar-queue doctor` (90% of issues)
2. **Check GitHub Issues** — Search existing issues
3. **Enable debug** — `DEBUG=sonar-queue:*` for verbose output
4. **Report bug** — Include:
   - `sonar-queue doctor` output
   - Command that failed
   - Relevant logs
   - Node.js version (`node --version`)
   - OS (`uname -a` or Windows version)

---

## Known Limitations

| Limitation | Workaround |
|------------|------------|
| No PR decoration (Community Build) | Use SonarQube Cloud Free for PR analysis |
| Single branch analysis (Community Build) | Use main branch only |
| No advanced security (Community Build) | Upgrade to Developer/Enterprise for SCA/SAST |
| Scanner requires Java 17+ | Ensure `java --version` ≥ 17 |
| No Windows service for Docker | Use Docker Desktop on Windows |