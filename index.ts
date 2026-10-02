import { loadState } from './state.js';
import { handleSync } from './queue/sync.js';
import { handleNext, handleClaim, handleClaimNext } from './queue/next.js';
import { handleResolve } from './queue/resolve.js';
import { handleWontFix } from './queue/wontfix.js';
import { handleFalsePositive } from './queue/falsepositive.js';
import { handleDefer } from './queue/defer.js';
import { handleReset } from './queue/reset.js';
import { handleStatus } from './queue/status.js';
import { handleExport } from './queue/export.js';
import { handleScan } from './queue/scan.js';
import { handleInit } from './setup/init.js';
import { handleSetup } from './setup/wizard.js';
import { handleDoctor } from './setup/doctor.js';
import {
  handleStart,
  handleStop,
  handleRestart,
  handleReset as handleDockerReset,
  handleDockerStatus,
} from './setup/docker.js';
import type { AgentState, TrackedIssue } from './types.js';

type CommandHandler = (
  state: AgentState,
  stateMap: Map<string, TrackedIssue>,
  args: string[]
) => Promise<void> | void;

const COMMANDS: Record<string, CommandHandler> = {
  sync:          (state, stateMap)       => handleSync(state, stateMap),
  next:          (_, stateMap, args)     => handleNext(stateMap, args),
  claim:         (state, stateMap, args) => handleClaim(state, stateMap, args),
  'claim-next':  (state, stateMap, args) => handleClaimNext(state, stateMap, args),
  resolve:       (state, stateMap, args) => handleResolve(state, stateMap, args),
  wontfix:       (state, stateMap, args) => handleWontFix(state, stateMap, args),
  falsepositive: (state, stateMap, args) => handleFalsePositive(state, stateMap, args),
  defer:         (state, stateMap, args) => handleDefer(state, stateMap, args),
  reset:         (state, stateMap, args) => handleReset(state, stateMap, args),
  status:        (_, stateMap, args)     => handleStatus(stateMap, args),
};

function printHelp(): void {
  console.log(`
Sonar Queue — Local SonarQube Developer Tool

Usage: sonar-queue <command> [options]

  Setup & Diagnostics:
    init [--force]                                  Bootstrap SonarQube config and AI skill
    setup                                           Interactive project wizard (key, token, .env)
    doctor                                          Full environment diagnostic report

  Infrastructure (Docker Compose + PostgreSQL):
    start                                           Start SonarQube + PostgreSQL via Docker Compose
    stop                                            Stop containers (data preserved)
    restart                                         Stop then start
    docker-status                                   Show container status and uptime
    docker-reset                                    ⚠ Destroy all containers and volumes (irreversible)

  Analysis:
    scan [...sonar-scanner flags]                   Run SonarScanner with automatic token injection
    export                                          Wait for CE task, then fetch lean issues from SonarQube

Data & Queue (Read-only):
    status [--file <path>]                          Dense queue lifecycle summary
    next [N] [--file <p>] [--rule <r>] [--severity ] [--type <t>]
                                                    View next N prioritized pending issues

  Queue (State mutation):
    claim <key>                                     Claim an issue (pending → investigating)
    claim-next [N] [--file <p>] [--rule <r>]        Claim next N filtered issues
    resolve <key> [notes]                           Mark issue fixed (awaiting verification)
    wontfix <key> <reason>                          Mark wont-fix (reason required)
    falsepositive <key> <reason>                    Mark false-positive (reason required)
    defer <key> <reason>                            Defer to future sprint (reason required)
    reset <key>                                     Reset back to pending
    sync                                            Fetch lean issues from SonarQube, reconcile & verify
  `);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  // ── Infrastructure commands (no state loading needed) ──────────────────────
  if (command === 'init') { await handleInit(args); return; }
  if (command === 'setup') { await handleSetup(args); return; }
  if (command === 'export') { await handleExport(); return; }
  if (command === 'doctor') { await handleDoctor(); return; }
  if (command === 'start') { handleStart(args); return; }
  if (command === 'stop') { handleStop(); return; }
  if (command === 'restart') { handleRestart(args); return; }
  if (command === 'docker-reset') { await handleDockerReset([]); return; }
  if (command === 'docker-status') { handleDockerStatus(); return; }
  if (command === 'scan') { handleScan(args); return; }

  // ── Queue commands (require state loading) ─────────────────────────────────
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: "${command}". Run with "help" for usage.`);
    process.exitCode = 1;
    return;
  }

  const state = await loadState();
  const stateMap = new Map<string, TrackedIssue>(Object.entries(state.issues));

  await handler(state, stateMap, args);
}

try {
  await main();
} catch (err: unknown) {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  console.error(`Fatal error: ${message}`);
  process.exitCode = 1;
}
