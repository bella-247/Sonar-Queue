import { spawnSync } from 'node:child_process';
import { getConfig } from '../setup/config.js';
import { findSonarScanner } from '../utils/scanner.js';

export function handleScan(args: string[]): void {
  const config = getConfig();

  if (!config.token) {
    console.error('Error: SONAR_TOKEN is not configured.');
    console.error('Set SONAR_TOKEN in .env.sonar.local or export SONAR_TOKEN=<token>.');
    process.exitCode = 1;
    return;
  }

  const scanner = findSonarScanner();
  if (!scanner) {
    console.error('Error: sonar-scanner not found in PATH.');
    console.error('Run: sonar-queue doctor   to check your setup.');
    console.error(
      'Download: https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/scanners/sonarscanner/'
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Scanning: ${config.projectName} (${config.projectKey})`);
  console.log(`Server:   ${config.hostUrl}`);
  console.log(`Scanner:  ${scanner.bin} ${scanner.version}`);
  console.log('');

  // Pass token explicitly — required for some scanner versions (see verified setup notes)
  const scanArgs = [`-Dsonar.token=${config.token}`, ...args];

  const result = spawnSync(scanner.bin, scanArgs, {
    encoding: 'utf-8',
    stdio: 'inherit',
    cwd: config.projectRoot,
  });

  if (result.status !== 0) {
    console.error('\nScan failed. Check the output above for details.');
    process.exitCode = result.status ?? 1;
    return;
  }

  console.log('\nScan complete. Run: sonar-queue export   to fetch results.');
}
