#!/usr/bin/env node
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.resolve(__dirname, '../dist/index.js');

if (fs.existsSync(distPath)) {
  await import(distPath);
} else {
  const tsEntry = path.resolve(__dirname, '../index.ts');
  const child = spawn(process.execPath, ['--import', 'tsx', tsEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
