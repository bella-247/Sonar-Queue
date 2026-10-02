# Configuration Guide

## Configuration Resolution

Sonar Queue resolves configuration through a **cascading priority system** (highest to lowest):

```
1. Environment Variables          (highest)
2. sonar-queue.json               (project-specific JSON)
3. sonar-project.properties       (Sonar standard)
4. .env.sonar.local               (local secrets)
5. package.json                   (project name fallback)
6. Sensible Defaults              (lowest)
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SONAR_PROJECT_ROOT` | Auto-detected | Project root directory |
| `SONAR_PROJECT_KEY` | From props/pkg.json | SonarQube project key |
| `SONAR_PROJECT_NAME` | From props/key | Display name |
| `SONAR_HOST_URL` | `http://localhost:9100` | SonarQube server URL |
| `SONAR_TOKEN` | From `.env.sonar.local` | Authentication token |
| `SONAR_RESULTS_DIR` | `./sonarqube-results` | Output directory |
| `SONAR_STATE_FILE` | `<resultsDir>/agent-state.json` | State file path |
| `SONAR_ISSUES_FILE` | **Removed** | No longer used (lean architecture) |

---

## Configuration Files

### 1. `sonar-queue.json` (Custom Project Config)

```json
{
  "projectKey": "my-custom-key",
  "projectName": "My Project",
  "hostUrl": "https://sonar.mycompany.com",
  "resultsDir": ".sonar-results",
  "stateFile": ".sonar-results/agent-state.json"
}
```

Useful for:
- Monorepos with different keys per subproject
- CI/CD where env vars are inconvenient
- Overriding defaults without env vars

### 2. `sonar-project.properties` (Sonar Standard)

```properties
# Required
sonar.projectKey=my-project
sonar.projectName=My Project
sonar.host.url=http://localhost:9100

# Optional (used by sonar-scanner)
sonar.sources=src
sonar.tests=test
sonar.sourceEncoding=UTF-8
sonar.exclusions=**/node_modules/**,**/dist/**,**/*.d.ts
```

**Read by Sonar Queue for:** `projectKey`, `projectName`, `host.url`

### 3. `.env.sonar.local` (Local Secrets)

```bash
# SonarQube Local Authentication
SONAR_TOKEN=sqp_0123456789abcdef0123456789abcdef01234567
SONAR_HOST_URL=http://localhost:9100
SONAR_PROJECT_KEY=my-project
```

**Never commit this file** — added to `.gitignore` by `init`.

### 4. `package.json` (Fallback)

```json
{
  "name": "my-project",
  "version": "1.0.0"
}
```

Used as fallback for `projectKey` and `projectName` if nothing else specifies them.

---

## Project Root Discovery

`findProjectRoot()` climbs from `cwd` upward until it finds a marker:

```typescript
const rootMarkers = [
  'sonar-project.properties',
  '.env.sonar.local',
  'package.json',
  '.git',
  'sonar-queue.json'
];
```

Override with:
```bash
export SONAR_PROJECT_ROOT=/path/to/project
```

---

## SonarQube Token

### Required Token Type

| Prefix | Type | Use Case |
|--------|------|----------|
| `sqp_` | **Project Analysis Token** | **Recommended** — scoped to one project |
| `squ_` | User Token | Carries your user permissions |
| `sqa_` | Global Analysis Token | Multi-project, admin-level |

### Generating a Project Token (Recommended)

1. Open SonarQube: `http://localhost:9100` (or your URL)
2. Navigate to your project
3. **Project Settings → Analysis Tokens**
4. Name: `sonar-queue-cli` (or similar)
5. Click **Generate** → Copy the `sqp_...` token
6. Paste into `.env.sonar.local`

### Token Validation

`sonar-queue setup` and `sonar-queue doctor` validate tokens against:
```
GET /api/authentication/validate
Authorization: Basic base64(token:)
```

Returns `{ "valid": true }` on success.

---

## Docker Configuration

### Default Ports

| Service | Internal | Host (default) |
|---------|----------|----------------|
| SonarQube | 9000 | 9100 (127.0.0.1:9100) |
| PostgreSQL | 5432 | Not exposed |

### Customize Port

```bash
# In .env.sonar.local or sonar-project.properties
SONAR_HOST_URL=http://localhost:9200
# or
sonar.host.url=http://localhost:9200
```

`sonar-queue start` reads port from `hostUrl`.

### Data Persistence

Volumes (preserved across `stop`/`restart`):
```
sonarqube_db          → PostgreSQL data
sonarqube_data        → SonarQube data
sonarqube_extensions  → Plugins/extensions
sonarqube_logs        → Logs
```

Located at: `~/.local/share/sonar-queue/`

### Reset (Destroy Data)

```bash
sonar-queue docker-reset
# Confirms with y/N
# Removes containers + volumes + compose file
```

---

## SonarScanner Configuration

### Required in PATH

```bash
# Verify
sonar-scanner --version
# or
sonar-queue doctor
```

### Auto Token Injection

`sonar-queue scan` injects token automatically:
```bash
sonar-scanner -Dsonar.token=sqp_... [your-args]
```

Pass additional flags:
```bash
sonar-queue scan -Dsonar.sources=src -Dsonar.tests=test
```

### Scanner Detection

Checks both:
- `sonar-scanner` (Unix/macOS)
- `sonar-scanner.bat` (Windows)

---

## AI Agent Skill Installation

### Automatic (via `init`)

```bash
sonar-queue init
# Installs: .agents/skills/sonar-scanner/SKILL.md
```

### Manual

Copy `templates/SKILL.md` to your agent's skill directory:
- **Claude Code**: `.claude/skills/sonar-scanner/SKILL.md`
- **Cursor**: `.cursor/skills/sonar-scanner/SKILL.md`
- **Codex**: `.codex/skills/sonar-scanner/SKILL.md`
- **OpenCode**: `.opencode/skills/sonar-scanner/SKILL.md`
- **Generic**: `.agents/skills/sonar-scanner/SKILL.md`

### Skill Version

The skill has a version in its frontmatter:
```yaml
metadata:
  version: "1.1.0"
```

Update with `sonar-queue init --force` after upgrading the CLI.

---

## Common Configuration Patterns

### Monorepo (Multiple Projects)

```bash
# Root package.json
cd /my-monorepo
npx sonar-queue init  # Creates root config

# Per package
cd packages/backend
npx sonar-queue init  # Creates package-specific config

cd packages/frontend
npx sonar-queue init
```

Each gets its own `agent-state.json` in its `sonarqube-results/`.

### CI/CD Pipeline

```yaml
# .github/workflows/sonar.yml
jobs:
  sonar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      
      - name: Install sonar-queue
        run: npm install -g sonar-queue
      
      - name: Configure
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
          SONAR_HOST_URL: ${{ secrets.SONAR_HOST }}
        run: |
          sonar-queue init --force
      
      - name: Scan
        run: sonar-queue scan
      
      - name: Sync & Report
        run: sonar-queue sync
```

### Multiple SonarQube Instances

```bash
# Project A
export SONAR_HOST_URL=http://sonar-team-a:9100
export SONAR_TOKEN=sqp_aaa...
sonar-queue init

# Project B
export SONAR_HOST_URL=http://sonar-team-b:9100
export SONAR_TOKEN=sqp_bbb...
cd /other/project
sonar-queue init
```

---

## Troubleshooting Config

### "Project root not found"
```bash
# Ensure you're in a git repo or have sonar-project.properties
ls -la sonar-project.properties package.json .git

# Or set explicitly
export SONAR_PROJECT_ROOT=/path/to/project
```

### "SONAR_TOKEN not configured"
```bash
# Check .env.sonar.local exists and has token
cat .env.sonar.local

# Or set via env
export SONAR_TOKEN=sqp_...
```

### "Config not reloading"
```bash
# Config is cached per process
# Restart CLI or use:
sonar-queue doctor  # Forces fresh config load
```

### Wrong project key in SonarQube
```bash
# Check what config resolves to
sonar-queue doctor
# Look at "Project" section

# Verify sonar-project.properties
cat sonar-project.properties
```

### Port conflicts
```bash
# Change port in .env.sonar.local
SONAR_HOST_URL=http://localhost:9200

# Restart
sonar-queue restart
```

---

## Configuration Schema (TypeScript)

```typescript
interface SonarQueueConfig {
  projectRoot: string;    // Resolved project root
  projectKey: string;     // SonarQube project key
  projectName: string;    // Display name
  hostUrl: string;        // SonarQube server URL
  token?: string;         // Auth token (optional for some commands)
  resultsDir: string;     // Output directory
  stateFile: string;      // agent-state.json path
}
```

All fields guaranteed non-empty after `getConfig()` resolution.