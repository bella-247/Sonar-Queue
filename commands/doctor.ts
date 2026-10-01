import fsSync from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { getConfig } from '../config.js';

interface CheckResult {
  label: string;
  ok: boolean;
  detail: string;
}

function check(label: string, ok: boolean, detail: string): CheckResult {
  return { label, ok, detail };
}

async function checkSonarQubeConnectivity(
  hostUrl: string,
  token: string | undefined
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  try {
    const res = await fetch(`${hostUrl}/api/system/ping`, {
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    const alive = res.ok || text.trim() === 'pong';
    results.push(check('SonarQube server reachable', alive, `${hostUrl} → HTTP ${res.status}`));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push(check('SonarQube server reachable', false, `${hostUrl} → ${msg}`));
  }

  if (!token) {
    results.push(check('Auth token configured', false, 'SONAR_TOKEN not set in .env.sonar.local or env'));
  } else {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${token}:`).toString('base64');
      const res = await fetch(`${hostUrl}/api/authentication/validate`, {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = (await res.json()) as { valid?: boolean };
        results.push(check('Auth token valid', data.valid === true, data.valid ? 'Token accepted' : 'Token rejected by server'));
      } else {
        results.push(check('Auth token valid', false, `HTTP ${res.status}`));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push(check('Auth token valid', false, msg));
    }
  }

  return results;
}

function checkScannerInstalled(): CheckResult {
  for (const bin of ['sonar-scanner', 'sonar-scanner.bat']) {
    try {
      const result = spawnSync(bin, ['--version'], { encoding: 'utf-8', timeout: 5000 });
      if (result.status === 0) {
        const version = (result.stdout || result.stderr || '').split('\n')[0].trim();
        return check('sonar-scanner CLI installed', true, version || bin);
      }
    } catch {
      // try next
    }
  }
  return check(
    'sonar-scanner CLI installed',
    false,
    'Not found in PATH. Download from https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/scanners/sonarscanner/'
  );
}

function checkDockerInstalled(): CheckResult {
  try {
    const result = spawnSync('docker', ['--version'], { encoding: 'utf-8', timeout: 5000 });
    if (result.status === 0) {
      return check('Docker installed', true, (result.stdout || '').trim());
    }
  } catch {
    // not installed
  }
  return check('Docker installed', false, 'Not found in PATH');
}

function checkSonarQubeContainer(): CheckResult {
  try {
    const result = spawnSync(
      'docker',
      ['ps', '--filter', 'name=^sonarqube$', '--format', '{{.Names}} {{.Status}}'],
      { encoding: 'utf-8', timeout: 5000 }
    );
    if (result.status === 0) {
      const output = (result.stdout || '').trim();
      if (output) return check('SonarQube container running', true, output);
      return check('SonarQube container running', false, 'No sonarqube container. Run: sonar-queue start');
    }
  } catch {
    // docker not available
  }
  return check('SonarQube container running', false, 'Docker not available');
}

function checkNodeVersion(): CheckResult {
  const v = process.version;
  const major = parseInt(v.slice(1).split('.')[0], 10);
  return check('Node.js version', major >= 18, `${v} (minimum: v18)`);
}

export async function handleDoctor(): Promise<void> {
  const config = getConfig();
  const results: CheckResult[] = [];

  results.push(checkNodeVersion());

  const propPath = path.join(config.projectRoot, 'sonar-project.properties');
  if (fsSync.existsSync(propPath)) {
    results.push(check('sonar-project.properties', true, propPath));
  } else {
    results.push(check('sonar-project.properties', false, 'Not found. Run: sonar-queue init'));
  }

  results.push(checkScannerInstalled());

  const dockerResult = checkDockerInstalled();
  results.push(dockerResult);
  if (dockerResult.ok) {
    results.push(checkSonarQubeContainer());
  }

  const connectivityResults = await checkSonarQubeConnectivity(config.hostUrl, config.token);
  results.push(...connectivityResults);

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;

  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    console.log(`  ${icon} ${r.label}: ${r.detail}`);
  }

  console.log(`\nDoctor: ${pass} passed, ${fail} failed`);

  if (fail > 0) process.exit(1);
}
