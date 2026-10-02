# Publishing to npm

## Pre-Publish Checklist

### 1. Verify Build
```bash
npm run typecheck   # Must pass
npm run build       # Must produce dist/
```

### 2. Run Tests (if any)
```bash
# If test script exists:
npm test
```

### 3. Verify Package Contents
```bash
npm pack --dry-run
# Should include:
# - dist/ (compiled JS + .d.ts)
# - bin/sonar-queue.js
# - templates/
# - README.md
# - package.json
```

### 4. Update Version
```bash
# Patch (bug fixes):
npm version patch

# Minor (new features):
npm version minor

# Major (breaking changes):
npm version major
```

This updates `package.json`, creates git tag, commits.

### 3. Publish
```bash
# Public package:
npm publish --access public

# Or if private/org:
npm publish
```

### 4. Verify Published
```bash
npm view sonar-queue
npm install -g sonar-queue
sonar-queue --help
```

---

## Package.json Configuration

```json
{
  "name": "sonar-queue",
  "version": "1.0.0",
  "description": "Token-optimized SonarQube queue manager and AI agent remediation engine",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "sonar-queue": "./bin/sonar-queue.js"
  },
  "files": [
    "dist",
    "bin",
    "templates",
    "README.md"
  ],
  "scripts": {
    "build": "tsc && cp -r templates dist/ 2>/dev/null || true",
    "prepare": "npm run build",
    "typecheck": "tsc --noEmit",
    "start": "tsx index.ts",
    "pack": "npm run build && npm pack"
  },
  "keywords": [
    "sonarqube",
    "code-quality",
    "ai-agent",
    "remediation-queue",
    "token-optimization"
  ],
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^22.14.0",
    "tsx": "^4.21.0",
    "typescript": "^5.8.2"
  }
}
```

### Key Fields Explained

| Field | Purpose |
|-------|---------|
| `"type": "module"` | ES modules (import/export) |
| `"main"` | Entry point for `require()` / `import` |
| `"types"` | TypeScript definitions |
| `"bin"` | Creates `sonar-queue` CLI command on install |
| `"files"` | What gets published to npm (excludes source .ts, node_modules) |
| `"prepare"` | Runs `build` automatically on `npm install` / `npm publish` |

---

## Bin Wrapper (`bin/sonar-queue.js`)

```javascript
#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try compiled dist first (for npm install)
try {
  await import('../dist/index.js');
} catch {
  // Fallback to tsx for development
  const tsEntry = path.resolve(__dirname, '../index.ts');
  const child = spawn(process.execPath, ['--import', 'tsx', tsEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
```

**Behavior:**
- Published package → uses `dist/index.js` (fast, no tsx dependency)
- Development (`npx tsx index.ts`) → uses tsx directly

---

## CI/CD for Automated Publishing

### GitHub Actions (`.github/workflows/publish.yml`)

```yaml
name: Publish to npm

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Typecheck
        run: npm run typecheck
      
      - name: Build
        run: npm run build
      
      - name: Publish
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Required Secrets
- `NPM_TOKEN` — npm automation token (Settings → Developer settings → Access tokens)

---

## Versioning Strategy

Follow **Semantic Versioning** (semver.org):

| Version | When |
|---------|------|
| `1.0.0` | Initial public release |
| `1.0.1` | Bug fixes only |
| `1.1.0` | New features (backward compatible) |
| `2.0.0` | Breaking changes |

### Breaking Changes (Major)
- Removing commands
- Changing `TrackedIssue` field types
- Changing config resolution order
- Removing `export` command (if done)

### New Features (Minor)
- New commands
- New filter options
- New config options
- New SKILL.md rules

### Bug Fixes (Patch)
- Fix sync regression logic
- Fix doctor summary bug
- Fix token validation

---

## Post-Publish Verification

```bash
# 1. Fresh install
npm install -g sonar-queue@latest

# 2. Test CLI
sonar-queue --help
sonar-queue doctor

# 3. Test in fresh project
mkdir /tmp/test-project && cd /tmp/test-project
echo 'console.log("hi")' > index.js
echo '{"name":"test-project"}' > package.json
sonar-queue init
# Verify .agents/skills/sonar-scanner/SKILL.md installed
```

---

## Unpublishing (Emergency Only)

```bash
# Within 72 hours only:
npm unpublish sonar-queue@1.0.1

# After 72 hours: contact npm support
# Better: publish patch with fix instead
```

---

## Checklist for Each Release

- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] `npm pack --dry-run` shows correct files
- [ ] Version bumped appropriately
- [ ] Changelog updated (`CHANGELOG.md`)
- [ ] Git tag created (`git tag v1.x.x`)
- [ ] Published to npm
- [ ] Verified install works globally
- [ ] GitHub Release created with notes