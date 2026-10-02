import { spawnSync } from 'node:child_process';

export interface ScannerInfo {
  bin: string;
  version: string;
}
 
export function findSonarScanner(): ScannerInfo | null {
  for (const bin of ['sonar-scanner', 'sonar-scanner.bat']) {
    try {
      const r = spawnSync(bin, ['--version'], { encoding: 'utf-8', timeout: 5000 });
      if (r.status === 0) {
        const out = r.stdout || r.stderr || '';
        const cliLine = out.split('\n').find((l) => l.includes('SonarScanner'));
        if (cliLine) {
          const idx = cliLine.indexOf('SonarScanner');
          const version = cliLine.slice(idx).trim();
          return { bin, version: version || bin };
        }
        const fallback = out.split('\n')[0].trim();
        return { bin, version: fallback || bin };
      }
    } catch {
      // try next
    }
  }
  return null;
}