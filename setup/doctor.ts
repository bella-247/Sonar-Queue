import { spawnSync } from 'node:child_process';
import fsSync from 'node:fs';
import path from 'node:path';
import { getConfig } from './config.js';
import { findSonarScanner } from '../utils/scanner.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckResult {
  label: string;
  ok: boolean;
  detail: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function check(label: string, ok: boolean, detail: string): CheckResult {
  return { label, ok, detail };
}

function row(result: CheckResult): void {
  const icon = result.ok ? '✓' : '✗';
  const pad = Math.max(0, 36 - result.label.length);
  console.log(`  ${icon}  ${result.label}${' '.repeat(pad)}${result.detail}`);
}

function section(title: string): void {
  console.log('');
  console.log(title);
  console.log('─'.repeat(42));
}

// ─── Individual checks ────────────────────────────────────────────────────────

function checkOS(): CheckResult {
  const platform = process.platform;
  const arch = process.arch;
  let label = 'Windows';
  if (platform === 'linux') {
    try {
      label = fsSync.readFileSync('/etc/os-release', 'utf-8').match(/PRETTY_NAME="([^"]+)"/)?.[1] || 'Linux';
    } catch {
      label = 'Linux';
    }
  } else if (platform === 'darwin') {
    label = 'macOS';
  }
  return check('Operating system', true, `${label} (${arch})`);
}

function resolveExecutable(name: string): string {
  const candidates = [
    `/usr/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    `/bin/${name}`,
  ];
  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }
  return name;
}

function execBinary(name: string, args: string[], timeout = 5000) {
  return spawnSync(resolveExecutable(name), args, {
    encoding: 'utf-8',
    timeout,
  });
}

function checkNodeVersion(): CheckResult {
  const v = process.version;
  const major = Number.parseInt(v.slice(1).split('.')[0], 10);
  return check('Node.js', major >= 18, `${v} (minimum: v18)`);
}

function checkNpmVersion(): CheckResult {
  try {
    const r = execBinary('npm', ['--version'], 3000);
    if (r.status === 0) return check('npm', true, `v${r.stdout.trim()}`);
  } catch { /* not found */ }
  return check('npm', false, 'Not found');
}

function checkDocker(): CheckResult {
  try {
    const r = execBinary('docker', ['--version']);
    if (r.status === 0) return check('Docker', true, r.stdout.trim().replace('Docker version ', ''));
  } catch { /* not found */ }
  return check('Docker', false, 'Not found in PATH — https://docs.docker.com/engine/install/');
}

function checkDockerDaemon(): CheckResult {
  try {
    const r = execBinary('docker', ['info', '--format', '{{.ServerVersion}}']);
    if (r.status === 0 && r.stdout.trim()) {
      return check('Docker daemon', true, 'Running');
    }
  } catch { /* daemon down */ }
  return check('Docker daemon', false, 'Not running — run: sudo systemctl start docker');
}

function checkDockerCompose(): CheckResult {
  try {
    const r = execBinary('docker', ['compose', 'version', '--short']);
    if (r.status === 0) return check('Docker Compose', true, `v${r.stdout.trim()}`);
  } catch { /* not found */ }
  return check('Docker Compose', false, 'Not available — update Docker or install compose plugin');
}

function checkSonarQubeContainer(): CheckResult {
  try {
    const r = execBinary('docker', [
      'ps',
      '--filter',
      'name=^sonarqube$',
      '--format',
      '{{.Names}} ({{.Status}})',
    ]);
    if (r.status === 0) {
      const out = (r.stdout || '').trim();
      if (out) return check('SonarQube container', true, out);
      return check('SonarQube container', false, 'Not running — run: sonar-queue start');
    }
  } catch { /* docker not available */ }
  return check('SonarQube container', false, 'Docker not available');
}

function checkDbContainer(): CheckResult {
  try {
    const r = execBinary('docker', [
      'ps',
      '--filter',
      'name=^sonarqube-db$',
      '--format',
      '{{.Names}} ({{.Status}})',
    ]);
    if (r.status === 0) {
      const out = (r.stdout || '').trim();
      if (out) return check('PostgreSQL container', true, out);
      return check('PostgreSQL container', false, 'Not running — run: sonar-queue start');
    }
  } catch { /* docker not available */ }
  return check('PostgreSQL container', false, 'Docker not available');
}

async function checkTokenValidity(hostUrl: string, token: string): Promise<CheckResult> {
  try {
    const authHeader = 'Basic ' + Buffer.from(`${token}:`).toString('base64');
    const res = await fetch(`${hostUrl}/api/authentication/validate`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as { valid?: boolean };
      return check(
        'Auth token valid',
        data.valid === true,
        data.valid ? 'Token accepted' : 'Token rejected by server'
      );
    }
    return check('Auth token valid', false, `HTTP ${res.status}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return check('Auth token valid', false, msg);
  }
}

async function checkSonarQubeConnectivity(
  hostUrl: string,
  token: string | undefined
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  try {
    const res = await fetch(`${hostUrl}/api/system/status`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as { status?: string };
      const alive = data.status === 'UP';
      results.push(check('SonarQube reachable', alive, `${hostUrl} (status: ${data.status || 'UP'})`));
    } else {
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = 'Basic ' + Buffer.from(`${token}:`).toString('base64');
      }
      const pingRes = await fetch(`${hostUrl}/api/system/ping`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      const text = await pingRes.text();
      const alive = pingRes.ok || text.trim() === 'pong' || pingRes.status === 401;
      results.push(check('SonarQube reachable', alive, `${hostUrl} → HTTP ${pingRes.status}`));
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push(check('SonarQube reachable', false, `${hostUrl} → ${msg}`));
  }

  if (!token) {
    results.push(check('Auth token configured', false, 'SONAR_TOKEN not set in .env.sonar.local or env'));
  } else {
    results.push(await checkTokenValidity(hostUrl, token));
  }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function handleDoctor(): Promise<void> {
  const config = getConfig();

  console.log('');
  console.log('Sonar Queue — Environment Doctor');

  // 1. System
  section('System');
  const osCheck = checkOS();
  const nodeCheck = checkNodeVersion();
  const npmCheck = checkNpmVersion();
  row(osCheck);
  row(nodeCheck);
  row(npmCheck);

  // 2. Docker
  section('Docker');
  const dockerCheck = checkDocker();
  row(dockerCheck);
  const daemonCheck = checkDockerDaemon();
  row(daemonCheck);
  const composeCheck = checkDockerCompose();
  row(composeCheck);

  // 3. SonarQube Containers
  section('SonarQube');
  const sqContainerCheck = checkSonarQubeContainer();
  row(sqContainerCheck);
  const dbContainerCheck = checkDbContainer();
  row(dbContainerCheck);

  // 4. Project
  section('Project');
  const propPath = path.join(config.projectRoot, 'sonar-project.properties');
  const propCheck = check(
    'sonar-project.properties',
    fsSync.existsSync(propPath),
    fsSync.existsSync(propPath) ? propPath : 'Not found — run: sonar-queue setup'
  );
  row(propCheck);
  const envPath = path.join(config.projectRoot, '.env.sonar.local');
  const envCheck = check(
    '.env.sonar.local',
    fsSync.existsSync(envPath),
    fsSync.existsSync(envPath) ? 'Found' : 'Not found — run: sonar-queue setup'
  );
  row(envCheck);

  // 5. Scanner
  section('Scanner');
  const scannerInfo = findSonarScanner();
  const scannerCheck = check(
    'SonarScanner CLI',
    scannerInfo !== null,
    scannerInfo ? scannerInfo.version : 'Not found — https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/scanners/sonarscanner/'
  );
  row(scannerCheck);

  // 6. Connectivity (network)
  section('Connectivity');
  const connectivityResults = await checkSonarQubeConnectivity(config.hostUrl, config.token);
  for (const r of connectivityResults) row(r);

  // ─── Summary ──────────────────────────────────────────────────────────────

  const allChecks: CheckResult[] = [
    osCheck,
    nodeCheck,
    npmCheck,
    dockerCheck,
    daemonCheck,
    composeCheck,
    sqContainerCheck,
    dbContainerCheck,
    propCheck,
    envCheck,
    scannerCheck,
    ...connectivityResults,
  ];
  const pass = allChecks.filter((r) => r.ok).length;
  const fail = allChecks.filter((r) => !r.ok).length;

  console.log('');
  console.log(`Doctor: ${pass} passed, ${fail} failed`);
  console.log('');

  if (fail > 0) process.exitCode = 1;
}
