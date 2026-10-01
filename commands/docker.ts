import { spawn, spawnSync } from 'child_process';
import { getConfig } from '../config.js';

const CONTAINER_NAME = 'sonarqube';
const DEFAULT_PORT = 9100;
const VOLUME_DATA = 'sonarqube_data';
const VOLUME_LOGS = 'sonarqube_logs';
const VOLUME_EXT = 'sonarqube_extensions';

function getPort(hostUrl: string): number {
  try {
    const url = new URL(hostUrl);
    return parseInt(url.port, 10) || 9100;
  } catch {
    return DEFAULT_PORT;
  }
}

function dockerAvailable(): boolean {
  try {
    const r = spawnSync('docker', ['--version'], { encoding: 'utf-8', timeout: 3000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

function containerStatus(): 'running' | 'stopped' | 'none' {
  try {
    // Check running
    const running = spawnSync(
      'docker',
      ['ps', '--filter', `name=${CONTAINER_NAME}`, '--format', '{{.Names}}'],
      { encoding: 'utf-8', timeout: 3000 }
    );
    if ((running.stdout || '').trim().includes(CONTAINER_NAME)) return 'running';

    // Check stopped
    const all = spawnSync(
      'docker',
      ['ps', '-a', '--filter', `name=${CONTAINER_NAME}`, '--format', '{{.Names}}'],
      { encoding: 'utf-8', timeout: 3000 }
    );
    if ((all.stdout || '').trim().includes(CONTAINER_NAME)) return 'stopped';
  } catch {
    // docker not available
  }
  return 'none';
}

export async function handleStart(args: string[]): Promise<void> {
  if (!dockerAvailable()) {
    console.error('Error: Docker not found in PATH. Install Docker to use sonar-queue start.');
    process.exit(1);
  }

  const config = getConfig();
  const port = getPort(config.hostUrl);
  const status = containerStatus();

  if (status === 'running') {
    console.log(`SonarQube already running at ${config.hostUrl}`);
    return;
  }

  if (status === 'stopped') {
    console.log(`Starting existing SonarQube container...`);
    const r = spawnSync('docker', ['start', CONTAINER_NAME], { encoding: 'utf-8', stdio: 'inherit' });
    if (r.status !== 0) {
      console.error('Failed to start SonarQube container.');
      process.exit(1);
    }
  } else {
    console.log(`Creating SonarQube container on port ${port}...`);
    const runArgs = [
      'run', '-d',
      '--name', CONTAINER_NAME,
      '-p', `${port}:9000`,
      '-v', `${VOLUME_DATA}:/opt/sonarqube/data`,
      '-v', `${VOLUME_LOGS}:/opt/sonarqube/logs`,
      '-v', `${VOLUME_EXT}:/opt/sonarqube/extensions`,
      'sonarqube:lts-community',
    ];
    const r = spawnSync('docker', runArgs, { encoding: 'utf-8', stdio: 'inherit' });
    if (r.status !== 0) {
      console.error('Failed to create SonarQube container.');
      process.exit(1);
    }
  }

  console.log(`SonarQube starting at ${config.hostUrl} (may take 30-60 seconds to be ready)`);
  console.log(`Run: sonar-queue doctor   to check when it's ready`);
}

export async function handleStop(): Promise<void> {
  if (!dockerAvailable()) {
    console.error('Error: Docker not found in PATH.');
    process.exit(1);
  }

  const status = containerStatus();
  if (status === 'none') {
    console.log('No SonarQube container found.');
    return;
  }
  if (status === 'stopped') {
    console.log('SonarQube container is already stopped.');
    return;
  }

  const r = spawnSync('docker', ['stop', CONTAINER_NAME], { encoding: 'utf-8', stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('Failed to stop SonarQube container.');
    process.exit(1);
  }
  console.log('SonarQube stopped. Data volumes preserved.');
}
