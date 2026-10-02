import fs from 'node:fs';
import path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SonarQueueConfig {
  projectRoot: string;
  projectKey: string;
  projectName: string;
  hostUrl: string;
  token?: string;
  resultsDir: string;
  stateFile: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the first defined, non-empty trimmed string from the arguments.
 */
function first(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return undefined;
}

function loadJsonFile<T = Record<string, unknown>>(filePath: string): T {
  if (!fs.existsSync(filePath)) return {} as T;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {} as T;
  }
}

// ─── File Parsers ─────────────────────────────────────────────────────────────

/**
 * Parses a standard Java/Sonar .properties key-value file.
 */
export function parsePropertiesFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const entries: Record<string, string> = {};

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith('!')) continue;

      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim();
        const value = line.slice(eqIdx + 1).trim().replace(/\\$/, '').trim();
        entries[key] = value;
      }
    }
    return entries;
  } catch {
    return {};
  }
}

/**
 * Parses a simple .env file supporting optional single or double quotes.
 */
export function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const entries: Record<string, string> = {};

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim();
        let value = line.slice(eqIdx + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        entries[key] = value;
      }
    }
    return entries;
  } catch {
    return {};
  }
}

// ─── Project Root Discovery ───────────────────────────────────────────────────

/**
 * Climbs up the directory tree to find the project root marker.
 */
export function findProjectRoot(startDir = process.cwd()): string {
  if (process.env.SONAR_PROJECT_ROOT) {
    return path.resolve(process.env.SONAR_PROJECT_ROOT);
  }

  const rootMarkers = [
    'sonar-project.properties',
    '.env.sonar.local',
    'package.json',
    '.git',
    'sonar-queue.json',
  ];

  let current = path.resolve(startDir);
  const systemRoot = path.parse(current).root;

  while (current !== systemRoot) {
    const hasMarker = rootMarkers.some((marker) => fs.existsSync(path.join(current, marker)));
    if (hasMarker) return current;
    current = path.dirname(current);
  }

  return path.resolve(startDir);
}

// ─── Configuration Resolver ───────────────────────────────────────────────────

let cachedConfig: SonarQueueConfig | null = null;

/**
 * Resolves configuration by cascading through:
 * 1. Environment variables (highest priority)
 * 2. Custom JSON config (sonar-queue.json)
 * 3. sonar-project.properties
 * 4. .env.sonar.local
 * 5. Sensible defaults
 */
export function getConfig(overrideRoot?: string): SonarQueueConfig {
  if (cachedConfig && !overrideRoot) {
    return cachedConfig;
  }

  const projectRoot = overrideRoot ? path.resolve(overrideRoot) : findProjectRoot();

  // Load all configuration sources
  const props = parsePropertiesFile(path.join(projectRoot, 'sonar-project.properties'));
  const envLocal = parseEnvFile(path.join(projectRoot, '.env.sonar.local'));
  const custom = loadJsonFile<Record<string, string>>(path.join(projectRoot, 'sonar-queue.json'));
  const pkg = loadJsonFile<{ name?: string }>(path.join(projectRoot, 'package.json'));

  // 1. Project Identity
  const defaultKey = pkg.name || path.basename(projectRoot);
  const projectKey = first(
    process.env.SONAR_PROJECT_KEY,
    custom.projectKey,
    props['sonar.projectKey'],
    envLocal.SONAR_PROJECT_KEY,
    defaultKey
  )!;

  const projectName = first(
    process.env.SONAR_PROJECT_NAME,
    custom.projectName,
    props['sonar.projectName'],
    projectKey
  )!;

  // 2. Server & Authentication
  const hostUrl = first(
    process.env.SONAR_HOST_URL,
    custom.hostUrl,
    props['sonar.host.url'],
    envLocal.SONAR_HOST_URL,
    'http://localhost:9100'
  )!;

  const token = first(
    process.env.SONAR_TOKEN,
    custom.token,
    envLocal.SONAR_TOKEN
  );

  // 3. Storage Paths
  const resultsDir = first(
    process.env.SONAR_RESULTS_DIR,
    custom.resultsDir,
    path.join(projectRoot, 'sonarqube-results')
  )!;

  const stateFile = first(
    process.env.SONAR_STATE_FILE,
    custom.stateFile,
    path.join(resultsDir, 'agent-state.json')
  )!;

  cachedConfig = {
    projectRoot,
    projectKey,
    projectName,
    hostUrl,
    token,
    resultsDir,
    stateFile,
  };

  return cachedConfig;
}
