import { loadState } from './state.js';
import { handleSync } from './sync.js';
import { handleNext, handleClaim, handleClaimNext } from './commands/next.js';
import { handleResolve } from './commands/resolve.js';
import { handleWontFix } from './commands/wontfix.js';
import { handleFalsePositive } from './commands/falsepositive.js';
import { handleDefer } from './commands/defer.js';
import { handleReset } from './commands/reset.js';
import { handleStatus } from './commands/status.js';
import { handleExport } from './commands/export.js';
import { handleInit } from './commands/init.js';
import { handleDoctor } from './commands/doctor.js';
import { handleStart, handleStop } from './commands/docker.js';
import type { AgentState, TrackedIssue } from './types.js';

type CommandHandler = (
  state: AgentState,
  stateMap: Map<string, TrackedIssue>,
  args: string[]
) => Promise<void> | void;

const COMMANDS: Record<string, CommandHandler> = {
  sync: (state, stateMap) => handleSync(state, stateMap),
  next: (_, stateMap, args) => handleNext(stateMap, args),
  claim: (state, stateMap, args) => handleClaim(state, stateMap, args),
  'claim-next': (state, stateMap, args) => handleClaimNext(state, stateMap, args),
  resolve: (state, stateMap, args) => handleResolve(state, stateMap, args),
  wontfix: (state, stateMap, args) => handleWontFix(state, stateMap, args),
  falsepositive: (state, stateMap, args) => handleFalsePositive(state, stateMap, args),
  defer: (state, stateMap, args) => handleDefer(state, stateMap, args),
  reset: (state, stateMap, args) => handleReset(state, stateMap, args),
  status: (_, stateMap, args) => handleStatus(stateMap, args),
};

function printHelp(): void {
  console.log(`
Sonar-Queue — Token-Optimized SonarQube Queue Manager

Usage: sonar-queue <command> [options]

  Setup:
    init [--force]                                   Bootstrap SonarQube config and AI skill in current project
    doctor                                           Check server connectivity, token, scanner, and Docker

  Infrastructure (Docker):
    start                                            Start local SonarQube via Docker (persists data volumes)
    stop                                             Stop local SonarQube container (data preserved)

  Data:
    export                                           Fetch issues, metrics, and quality gate from SonarQube API
    sync                                             Reconcile scan results into queue state

  Queue (Read-only):
    status [--file <path>]                           Dense 2-line scan + queue summary
    next [N] [--file <p>] [--rule <r>] [--severity <s>] [--type <t>]
                                                     View next N prioritized pending issues

  Queue (State mutation):
    claim <key>                                      Claim an issue (pending → investigating)
    claim-next [N] [--file <p>] [--rule <r>]         Claim next N filtered issues
    resolve <key> [notes]                            Mark issue fixed (awaiting verification)
    wontfix <key> <reason>                           Mark wont-fix (reason required)
    falsepositive <key> <reason>                     Mark false-positive (reason required)
    defer <key> <reason>                             Defer to a future sprint (reason required)
    reset <key>                                      Reset investigating/fixed back to pending
  `);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (command === 'init') {
    await handleInit(args);
    return;
  }

  if (command === 'export') {
    await handleExport();
    return;
  }

  if (command === 'doctor') {
    await handleDoctor();
    return;
  }

  if (command === 'start') {
    await handleStart(args);
    return;
  }

  if (command === 'stop') {
    await handleStop();
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: "${command}". Run with "help" for usage.`);
    process.exit(1);
  }

  const state = await loadState();
  const stateMap = new Map<string, TrackedIssue>(Object.entries(state.issues));

  await handler(state, stateMap, args);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
