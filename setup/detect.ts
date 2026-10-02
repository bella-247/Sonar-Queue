import fsSync from 'node:fs';
import path from 'node:path';

export interface DetectedStack {
  typescript: boolean;
  react: boolean;
  vite: boolean;
  vitest: boolean;
  jest: boolean;
  hasSrc: boolean;
  hasTest: boolean;
  hasCoverage: boolean;
}

export function detectStack(projectRoot: string): DetectedStack {
  let pkgJson: Record<string, unknown> = {};
  try {
    pkgJson = JSON.parse(fsSync.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
  } catch {
    // No package.json
  }

  const allDeps: Record<string, unknown> = {
    ...(pkgJson.dependencies as Record<string, unknown> | undefined),
    ...(pkgJson.devDependencies as Record<string, unknown> | undefined),
  };

  return {
    typescript: fsSync.existsSync(path.join(projectRoot, 'tsconfig.json')) || 'typescript' in allDeps,
    react: 'react' in allDeps,
    vite: 'vite' in allDeps,
    vitest: 'vitest' in allDeps,
    jest: 'jest' in allDeps || '@jest/core' in allDeps,
    hasSrc: fsSync.existsSync(path.join(projectRoot, 'src')),
    hasTest:
      fsSync.existsSync(path.join(projectRoot, 'test')) ||
      fsSync.existsSync(path.join(projectRoot, '__tests__')),
    hasCoverage:
      fsSync.existsSync(path.join(projectRoot, 'coverage')) ||
      fsSync.existsSync(path.join(projectRoot, 'coverage/lcov.info')),
  };
}

export function printDetectedStack(stack: DetectedStack): void {
  console.log('Detected project stack:');
  const items: [boolean, string][] = [
    [stack.typescript, 'TypeScript'],
    [stack.react, 'React'],
    [stack.vite, 'Vite'],
    [stack.vitest, 'Vitest'],
    [stack.jest, 'Jest'],
    [stack.hasSrc, 'src/ directory'],
    [stack.hasTest, 'test/ directory'],
    [stack.hasCoverage, 'coverage report'],
  ];
  for (const [active, label] of items) {
    if (active) {
      console.log(`  ✓ ${label}`);
    }
  }
  console.log('');
}
