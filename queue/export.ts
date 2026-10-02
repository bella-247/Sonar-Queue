import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { getConfig } from '../setup/config.js';
import type { SonarIssue } from '../types.js';
import { extractRelativeFile } from '../utils/priority.js';
import { handleSync } from './sync.js';
import { loadState } from '../state.js';

interface RawSonarIssue {
  key: string;
  rule: string;
  severity: string;
  component: string;
  line?: number;
  textRange?: { startLine: number };
  status: string;
  resolution?: string;
  message: string;
  type: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollCeTask(
  hostUrl: string,
  ceTaskId: string,
  headers: Record<string, string>,
  attemptsLeft = 60
): Promise<void> {
  if (attemptsLeft <= 0) return;

  const res = await fetch(`${hostUrl}/api/ce/task?id=${ceTaskId}`, { headers });
  if (res.ok) {
    const data = (await res.json()) as { task?: { status?: string } };
    const status = data.task?.status;
    if (status === 'SUCCESS') return;
    if (status === 'FAILED' || status === 'CANCELED') {
      console.error(`SonarQube task ${ceTaskId} ended with status: ${status}`);
      process.exitCode = 1;
      return;
    }
  }

  await delay(1000);
  return pollCeTask(hostUrl, ceTaskId, headers, attemptsLeft - 1);
}

export async function waitForCeTask(
  projectRoot: string,
  hostUrl: string,
  headers: Record<string, string>
): Promise<void> {
  const reportTaskFile = path.join(projectRoot, '.scannerwork', 'report-task.txt');
  if (!fsSync.existsSync(reportTaskFile)) return;

  try {
    const content = await fs.readFile(reportTaskFile, 'utf-8');
    const match = content.match(/^ceTaskId=(.+)$/m);
    if (match) {
      await pollCeTask(hostUrl, match[1].trim(), headers);
    }
  } catch {
    // Continue even if CE polling fails
  }
}

async function fetchAllRawIssues(
  hostUrl: string,
  projectKey: string,
  headers: Record<string, string>
): Promise<RawSonarIssue[]> {
  const pageSize = 500;
  const allIssues: RawSonarIssue[] = [];
  let page = 1;
  let totalIssues = 0;

  async function fetchPage(): Promise<void> {
    const url = `${hostUrl}/api/issues/search?componentKeys=${encodeURIComponent(
      projectKey
    )}&ps=${pageSize}&p=${page}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`Error fetching issues from SonarQube (${res.status} ${res.statusText})`);
      process.exitCode = 1;
      return;
    }

    const data = (await res.json()) as { total?: number; issues: RawSonarIssue[] };
    totalIssues = data.total || 0;
    allIssues.push(...data.issues);

    if (allIssues.length < totalIssues && data.issues.length >= pageSize) {
      page++;
      await fetchPage();
    }
  }

  await fetchPage();
  return allIssues;
}

export async function fetchIssuesFromSonar(): Promise<SonarIssue[]> {
  const config = getConfig();
  if (!config.token) {
    console.error('Error: SONAR_TOKEN is not configured.');
    console.error('Set SONAR_TOKEN in .env.sonar.local or export SONAR_TOKEN=<token>.');
    process.exitCode = 1;
    return [];
  }

  const authHeader = 'Basic ' + Buffer.from(`${config.token}:`).toString('base64');
  const headers = { Authorization: authHeader };

  await waitForCeTask(config.projectRoot, config.hostUrl, headers);

  const rawIssues = await fetchAllRawIssues(config.hostUrl, config.projectKey, headers);

  return rawIssues.map((issue) => {
    const file = extractRelativeFile(issue.component);
    const line = issue.line ?? issue.textRange?.startLine;
    return {
      key: issue.key,
      rule: issue.rule,
      severity: issue.severity,
      type: issue.type,
      component: issue.component,
      file,
      line,
      message: issue.message,
      status: issue.status,
      resolution: issue.resolution,
    };
  });
}

export async function handleExport(): Promise<void> {
  const state = await loadState();
  const stateMap = new Map(Object.entries(state.issues));
  await handleSync(state, stateMap);
}