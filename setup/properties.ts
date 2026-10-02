import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DetectedStack } from './detect.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findTemplate(relPath: string): string {
  const candidates = [
    path.resolve(__dirname, '../templates', relPath),
    path.resolve(__dirname, '../../templates', relPath),
    path.resolve(__dirname, '../../../templates', relPath),
  ];
  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export function buildPropertiesContent(
  projectKey: string,
  projectName: string,
  hostUrl: string,
  stack: DetectedStack
): string {
  const lines: string[] = [
    `sonar.projectKey=${projectKey}`,
    `sonar.projectName=${projectName}`,
    `sonar.host.url=${hostUrl}`,
    '',
    '# Source & Encoding',
    `sonar.sources=${stack.hasSrc ? 'src' : '.'}`,
    'sonar.sourceEncoding=UTF-8',
    '',
  ];

  if (stack.typescript) {
    lines.push(
      '# TypeScript',
      'sonar.typescript.tsconfigPath=tsconfig.json',
      ''
    );
  }

  if (stack.hasTest || stack.hasSrc) {
    lines.push('# Test directories');
    if (stack.hasTest) {
      lines.push('sonar.test.inclusions=**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx');
    }
    lines.push('');
  }

  if (stack.hasCoverage) {
    lines.push(
      '# Coverage',
      'sonar.javascript.lcov.reportPaths=coverage/lcov.info',
      ''
    );
  }

  lines.push(
    '# Exclusions',
    'sonar.exclusions=**/node_modules/**,**/dist/**,**/build/**,**/.next/**,**/coverage/**'
  );

  return lines.join('\n') + '\n';
}

export async function writePropertiesFile(
  projectRoot: string,
  projectKey: string,
  projectName: string,
  hostUrl: string,
  stack: DetectedStack
): Promise<void> {
  const propPath = path.join(projectRoot, 'sonar-project.properties');
  if (fsSync.existsSync(propPath)) {
    console.log('  Skipped: sonar-project.properties (already exists — preserved)');
    return;
  }

  let propContent: string;
  const templatePropPath = findTemplate('sonar-project.properties.template');
  if (fsSync.existsSync(templatePropPath)) {
    const raw = await fs.readFile(templatePropPath, 'utf-8');
    propContent = raw
      .replaceAll('{{PROJECT_KEY}}', projectKey)
      .replaceAll('{{PROJECT_NAME}}', projectName);
  } else {
    propContent = buildPropertiesContent(projectKey, projectName, hostUrl, stack);
  }

  await fs.writeFile(propPath, propContent, 'utf-8');
  console.log('  Created: sonar-project.properties ✓');
}
