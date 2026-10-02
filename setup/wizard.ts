import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { getConfig } from './config.js';
import { detectStack, printDetectedStack } from './detect.js';
import { promptAndVerifyToken } from './token.js';
import { writePropertiesFile } from './properties.js';

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function ensureGitignore(projectRoot: string, entriesToAdd: string[]): Promise<void> {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (!fsSync.existsSync(gitignorePath)) return;

  const current = await fs.readFile(gitignorePath, 'utf-8');
  const missing = entriesToAdd.filter((e) => !current.includes(e));

  if (missing.length > 0) {
    await fs.appendFile(gitignorePath, `\n# SonarQube\n${missing.join('\n')}\n`);
    console.log(`  Updated .gitignore (added: ${missing.join(', ')})`);
  } else {
    console.log('  .gitignore already covers SonarQube entries ✓');
  }
}

async function writeEnvFile(
  projectRoot: string,
  projectKey: string,
  hostUrl: string,
  token: string
): Promise<void> {
  const envPath = path.join(projectRoot, '.env.sonar.local');
  const envContent = `# SonarQube Local Authentication\n# Do NOT commit this file — it contains your private analysis token\nSONAR_TOKEN=${token}\nSONAR_HOST_URL=${hostUrl}\nSONAR_PROJECT_KEY=${projectKey}\n`;
  await fs.writeFile(envPath, envContent, { encoding: 'utf-8', mode: 0o600 });
  console.log('  Saved: .env.sonar.local ✓ (mode: 0600)');
}

function printNextSteps(): void {
  console.log('Setup complete! Next steps:');
  console.log('  1. Start SonarQube (if not running): sonar-queue start');
  console.log('  2. Check system readiness:           sonar-queue doctor');
  console.log('  3. Run your first project scan:      sonar-queue scan');
  console.log('  4. Export issues and Quality Gate:   sonar-queue export');
  console.log('  5. Reconcile into the AI queue:      sonar-queue sync');
  console.log('  6. View prioritized pending issues:  sonar-queue next 5\n');
}

export async function handleSetup(_args: string[] = []): Promise<void> {
  const config = getConfig();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n====================================');
  console.log('Sonar Queue — Interactive Project Setup');
  console.log('====================================\n');

  const stack = detectStack(config.projectRoot);
  printDetectedStack(stack);
  let projectKey;
  let projectName;
  let hostUrl = config.hostUrl;
  let token = '';

  try {
    const rawProjectKey = await ask(rl, `Project key [${config.projectKey}]: `);
    projectKey = rawProjectKey.trim() || config.projectKey;

    const rawProjectName = await ask(rl, `Project name [${config.projectName}]: `);
    projectName = rawProjectName.trim() || config.projectName;

    const rawHost = await ask(rl, `SonarQube URL [${config.hostUrl}]: `);
    hostUrl = rawHost.trim() || config.hostUrl;
    console.log('');

    token = await promptAndVerifyToken(rl, hostUrl, projectKey, config.token);
  } finally {
    rl.close();
  }

  console.log('\nConfiguring project files...');

  await writeEnvFile(config.projectRoot, projectKey, hostUrl, token);
  await writePropertiesFile(config.projectRoot, projectKey, projectName, hostUrl, stack);

  await fs.mkdir(config.resultsDir, { recursive: true });
  console.log(`  Created: ${path.relative(config.projectRoot, config.resultsDir)}/ ✓`);

  await ensureGitignore(config.projectRoot, ['.env.sonar.local', '.scannerwork/']);

  console.log('');
  printNextSteps();
}
