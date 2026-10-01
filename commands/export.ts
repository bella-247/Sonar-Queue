import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { getConfig } from '../config.js';
import type { SonarIssue } from '../types.js';

export async function handleExport(): Promise<void> {
  const config = getConfig();
  const token = config.token;

  if (!token) {
    console.error('Error: SONAR_TOKEN is not configured.');
    console.error('Set SONAR_TOKEN in .env.sonar.local or export SONAR_TOKEN=<token>.');
    process.exit(1);
  }

  const authHeader = 'Basic ' + Buffer.from(`${token}:`).toString('base64');
  const headers = { Authorization: authHeader };

  // 1. Wait for Compute Engine task if .scannerwork/report-task.txt exists
  const reportTaskFile = path.join(config.projectRoot, '.scannerwork', 'report-task.txt');
  if (fsSync.existsSync(reportTaskFile)) {
    try {
      const content = await fs.readFile(reportTaskFile, 'utf-8');
      const match = content.match(/^ceTaskId=(.+)$/m);
      if (match) {
        const ceTaskId = match[1].trim();
        for (let i = 0; i < 60; i++) {
          const res = await fetch(`${config.hostUrl}/api/ce/task?id=${ceTaskId}`, { headers });
          if (res.ok) {
            const data = (await res.json()) as { task?: { status?: string } };
            const status = data.task?.status;
            if (status === 'SUCCESS') break;
            if (status === 'FAILED' || status === 'CANCELED') {
              console.error(`SonarQube task ${ceTaskId} ended with status: ${status}`);
              process.exit(1);
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    } catch {
      // Continue even if CE polling fails
    }
  }

  // 2. Fetch issues paginated
  const pageSize = 500;
  let page = 1;
  const allIssues: SonarIssue[] = [];
  let totalIssues = 0;

  while (true) {
    const url = `${config.hostUrl}/api/issues/search?componentKeys=${encodeURIComponent(
      config.projectKey
    )}&ps=${pageSize}&p=${page}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`Error fetching issues from SonarQube (${res.status} ${res.statusText})`);
      process.exit(1);
    }

    const data = (await res.json()) as { total?: number; issues: SonarIssue[] };
    totalIssues = data.total || 0;
    allIssues.push(...data.issues);

    if (allIssues.length >= totalIssues || data.issues.length < pageSize) {
      break;
    }
    page++;
  }

  // 3. Fetch metrics (optional)
  let metricsData: unknown = null;
  try {
    const metricKeys =
      'bugs,vulnerabilities,code_smells,security_hotspots,coverage,duplicated_lines_density,ncloc,lines_to_cover,uncovered_lines';
    const mRes = await fetch(
      `${config.hostUrl}/api/measures/component?component=${encodeURIComponent(
        config.projectKey
      )}&metricKeys=${metricKeys}`,
      { headers }
    );
    if (mRes.ok) metricsData = await mRes.json();
  } catch {
    // Ignore metrics failure
  }

  // 4. Fetch quality gate (optional)
  let qualityGateData: unknown = null;
  try {
    const qRes = await fetch(
      `${config.hostUrl}/api/qualitygates/project_status?projectKey=${encodeURIComponent(
        config.projectKey
      )}`,
      { headers }
    );
    if (qRes.ok) qualityGateData = await qRes.json();
  } catch {
    // Ignore quality gate failure
  }

  // 5. Ensure directory and write files
  await fs.mkdir(config.resultsDir, { recursive: true });

  await fs.writeFile(
    config.issuesFile,
    JSON.stringify({ total: totalIssues, issues: allIssues }, null, 2),
    'utf-8'
  );

  if (metricsData) {
    await fs.writeFile(
      path.join(config.resultsDir, 'metrics.json'),
      JSON.stringify(metricsData, null, 2),
      'utf-8'
    );
  }

  if (qualityGateData) {
    await fs.writeFile(
      path.join(config.resultsDir, 'quality-gate.json'),
      JSON.stringify(qualityGateData, null, 2),
      'utf-8'
    );
  }

  // 6. Generate AI-readable markdown summary
  let reportMd = `# SonarQube Analysis — ${config.projectName}\n\n`;
  reportMd += `## Summary\n\n- Total issues: ${totalIssues}\n\n## Issues\n\n`;
  if (allIssues.length === 0) {
    reportMd += 'No issues were reported.\n';
  } else {
    for (const issue of allIssues) {
      reportMd += `### ${issue.rule || 'Unknown rule'} — ${issue.severity || 'UNKNOWN'}\n\n`;
      reportMd += `- **Message:** ${issue.message || 'N/A'}\n`;
      reportMd += `- **Type:** ${issue.type || 'N/A'}\n`;
      reportMd += `- **File:** ${issue.component || 'N/A'}\n`;
      reportMd += `- **Line:** ${issue.line ?? issue.textRange?.startLine ?? 'N/A'}\n`;
      reportMd += `- **Status:** ${issue.status || 'N/A'}\n`;
      reportMd += `- **Resolution:** ${issue.resolution || 'N/A'}\n`;
      reportMd += `- **Effort:** ${issue.effort || 'N/A'}\n\n`;
    }
  }

  await fs.writeFile(path.join(config.resultsDir, 'report.md'), reportMd, 'utf-8');

  const relResults = path.relative(config.projectRoot, config.resultsDir);
  console.log(`Exported: ${totalIssues} issues from SonarQube -> ${relResults}/`);
}
