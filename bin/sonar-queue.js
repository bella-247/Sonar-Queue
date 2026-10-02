#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// If compiled dist/index.js exists, run it directly; otherwise use tsx on index.ts
try {
  await import('../dist/index.js');
} catch {
  const tsEntry = path.resolve(__dirname, '../index.ts');
  const child = spawn(process.execPath, ['--import', 'tsx', tsEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
