import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SonarQueueConfig {
  projectRoot: string;
  projectKey: string;
  projectName: string;
  hostUrl: string;
  token?: string;
  resultsDir: string;
  issuesFile: string;
  stateFile: string;
}

export function findProjectRoot(startDir = process.cwd()): string {
  if (process.env.SONAR_PROJECT_ROOT) {
    return path.resolve(process.env.SONAR_PROJECT_ROOT);
  }

  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  while (current !== root) {
    if (
      fs.existsSync(path.join(current, 'sonar-project.properties')) ||
      fs.existsSync(path.join(current, '.git')) ||
      fs.existsSync(path.join(current, 'sonar-queue.json'))
    ) {
      return current;
    }
    current = path.dirname(current);
  }

  // Fallback: check __dirname/../.. if it has package.json or .git
  const packageParent = path.resolve(__dirname, '../..');
  if (fs.existsSync(path.join(packageParent, 'package.json'))) {
    return packageParent;
  }

  return process.cwd();
}

export function parsePropertiesFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return result;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      if (line.includes('=') && !line.startsWith('\\')) {
        const [k, ...vParts] = line.split('=');
        const key = k.trim();
        let val = vParts.join('=').trim();
        if (val.endsWith('\\')) {
          val = val.slice(0, -1).trim();
        }
        result[key] = val;
      }
    }
  } catch {
    // Ignore parse error
  }

  return result;
}

export function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return result;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (match) {
        const key = match[1];
        let val = match[2].trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        result[key] = val;
      }
    }
  } catch {
    // Ignore parse error
  }

  return result;
}

let cachedConfig: SonarQueueConfig | null = null;

export function getConfig(overrideRoot?: string): SonarQueueConfig {
  if (cachedConfig && !overrideRoot) {
    return cachedConfig;
  }

  const projectRoot = overrideRoot ? path.resolve(overrideRoot) : findProjectRoot();
  const propertiesPath = path.join(projectRoot, 'sonar-project.properties');
  const properties = parsePropertiesFile(propertiesPath);

  const envSonarPath = path.join(projectRoot, '.env.sonar.local');
  const envLocal = parseEnvFile(envSonarPath);

  // Optional custom json config
  const customJsonPath = path.join(projectRoot, 'sonar-queue.json');
  let customConfig: Record<string, unknown> = {};
  if (fs.existsSync(customJsonPath)) {
    try {
      customConfig = JSON.parse(fs.readFileSync(customJsonPath, 'utf-8'));
    } catch {
      // Ignore
    }
  }

  // Project Key resolution
  let projectKey =
    process.env.SONAR_PROJECT_KEY ||
    (typeof customConfig.projectKey === 'string' ? customConfig.projectKey : '') ||
    properties['sonar.projectKey'] ||
    envLocal.SONAR_PROJECT_KEY;

  if (!projectKey) {
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name) projectKey = pkg.name;
      } catch {
        // Ignore
      }
    }
  }

  if (!projectKey) {
    projectKey = path.basename(projectRoot);
  }

  // Project Name resolution
  const projectName =
    process.env.SONAR_PROJECT_NAME ||
    (typeof customConfig.projectName === 'string' ? customConfig.projectName : '') ||
    properties['sonar.projectName'] ||
    projectKey;

  // Host URL resolution
  const hostUrl =
    process.env.SONAR_HOST_URL ||
    (typeof customConfig.hostUrl === 'string' ? customConfig.hostUrl : '') ||
    properties['sonar.host.url'] ||
    envLocal.SONAR_HOST_URL ||
    'http://localhost:9100';

  // Token resolution
  const token =
    process.env.SONAR_TOKEN ||
    (typeof customConfig.token === 'string' ? customConfig.token : '') ||
    envLocal.SONAR_TOKEN ||
    undefined;

  // Results Directory resolution
  const resultsDir =
    process.env.SONAR_RESULTS_DIR ||
    (typeof customConfig.resultsDir === 'string'
      ? path.resolve(projectRoot, customConfig.resultsDir)
      : '') ||
    path.join(projectRoot, 'sonarqube-results');

  // Issues & State file resolution
  const issuesFile =
    process.env.SONAR_ISSUES_FILE ||
    (typeof customConfig.issuesFile === 'string'
      ? path.resolve(projectRoot, customConfig.issuesFile)
      : '') ||
    path.join(resultsDir, 'issues.json');

  const stateFile =
    process.env.SONAR_STATE_FILE ||
    (typeof customConfig.stateFile === 'string'
      ? path.resolve(projectRoot, customConfig.stateFile)
      : '') ||
    path.join(resultsDir, 'agent-state.json');

  cachedConfig = {
    projectRoot,
    projectKey,
    projectName,
    hostUrl,
    token,
    resultsDir,
    issuesFile,
    stateFile,
  };

  return cachedConfig;
}
