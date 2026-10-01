import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '../config.js';

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

export async function handleInit(args: string[] = []): Promise<void> {
  const config = getConfig();
  const force = args.includes('--force') || args.includes('-f');

  const propPath = path.join(config.projectRoot, 'sonar-project.properties');
  const envPath = path.join(config.projectRoot, '.env.sonar.local');
  const envExamplePath = path.join(config.projectRoot, '.env.sonar.local.example');
  const skillFile = path.join(config.projectRoot, '.agents', 'skills', 'sonar-scanner', 'SKILL.md');

  const hasProp = fsSync.existsSync(propPath);
  const hasSkill = fsSync.existsSync(skillFile);
  const hasResults = fsSync.existsSync(config.resultsDir);

  const isFullyInitialized = hasProp && hasSkill && hasResults;

  if (isFullyInitialized && !force) {
    console.log(
      `Already initialized: SonarQube workflow is active for "${config.projectName}" (${config.projectKey}).`
    );
    console.log('Configuration status:');
    console.log(`  - sonar-project.properties: present`);
    console.log(
      `  - .env.sonar.local: ${
        fsSync.existsSync(envPath)
          ? 'configured'
          : 'missing (copy from .env.sonar.local.example)'
      }`
    );
    console.log(`  - .agents/skills/sonar-scanner/SKILL.md: present`);
    console.log(
      `  - results directory: ${path.relative(config.projectRoot, config.resultsDir)}/`
    );
    console.log(
      '\nTip: Use "init --force" to re-install skill templates, or run "status" to view queue.'
    );
    return;
  }

  console.log(
    `${force ? 'Re-initializing' : 'Initializing'} SonarQube queue workflow for: ${config.projectName} (${config.projectKey})`
  );

  // 1. Ensure sonarqube-results directory
  await fs.mkdir(config.resultsDir, { recursive: true });

  // 2. Check / create .env.sonar.local.example
  if (!fsSync.existsSync(envExamplePath) || force) {
    const templateEnvPath = findTemplate('.env.sonar.local.template');
    let envContent = `# SonarQube Local Authentication\nSONAR_TOKEN=your_sonar_token_here\nSONAR_HOST_URL=http://localhost:9100\n`;
    if (fsSync.existsSync(templateEnvPath)) {
      envContent = await fs.readFile(templateEnvPath, 'utf-8');
    }
    await fs.writeFile(envExamplePath, envContent, 'utf-8');
    console.log(
      `${force && fsSync.existsSync(envExamplePath) ? 'Updated' : 'Created'}: .env.sonar.local.example`
    );
  } else {
    console.log('Skipped: .env.sonar.local.example (already exists)');
  }

  // 3. Check / create sonar-project.properties
  if (!fsSync.existsSync(propPath)) {
    const templatePropPath = findTemplate('sonar-project.properties.template');
    let propContent = `sonar.projectKey=${config.projectKey}\nsonar.projectName=${config.projectName}\nsonar.sources=src\nsonar.sourceEncoding=UTF-8\nsonar.scm.disabled=true\n`;
    if (fsSync.existsSync(templatePropPath)) {
      const raw = await fs.readFile(templatePropPath, 'utf-8');
      propContent = raw
        .replace(/\{\{PROJECT_KEY\}\}/g, config.projectKey)
        .replace(/\{\{PROJECT_NAME\}\}/g, config.projectName);
    }
    await fs.writeFile(propPath, propContent, 'utf-8');
    console.log('Created: sonar-project.properties');
  } else {
    console.log('Skipped: sonar-project.properties (already exists, preserved)');
  }

  // 4. Update .gitignore if present
  const gitignorePath = path.join(config.projectRoot, '.gitignore');
  if (fsSync.existsSync(gitignorePath)) {
    const currentGitignore = await fs.readFile(gitignorePath, 'utf-8');
    const toAdd: string[] = [];
    if (!currentGitignore.includes('.scannerwork')) toAdd.push('.scannerwork/');
    if (!currentGitignore.includes('.env.sonar.local')) toAdd.push('.env.sonar.local');
    if (toAdd.length > 0) {
      await fs.appendFile(gitignorePath, `\n# SonarQube\n${toAdd.join('\n')}\n`);
      console.log(`Updated: .gitignore (added ${toAdd.join(', ')})`);
    } else {
      console.log('Verified: .gitignore already ignores Sonar secrets and caches');
    }
  }

  // 5. Install / update agent skill in .agents/skills/sonar-scanner/SKILL.md
  if (!fsSync.existsSync(skillFile) || force) {
    const skillDir = path.dirname(skillFile);
    await fs.mkdir(skillDir, { recursive: true });
    const templateSkillPath = findTemplate('SKILL.md');
    if (fsSync.existsSync(templateSkillPath)) {
      await fs.copyFile(templateSkillPath, skillFile);
      console.log(
        `${force && hasSkill ? 'Updated' : 'Installed'}: .agents/skills/sonar-scanner/SKILL.md`
      );
    }
  } else {
    console.log('Skipped: .agents/skills/sonar-scanner/SKILL.md (already exists)');
  }

  console.log('\nSonarQube queue workflow ready.');
}
