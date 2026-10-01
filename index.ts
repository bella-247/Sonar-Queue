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
Sonar-Queue CLI (Universal SonarQube AI Queue Manager)
Usage:
  init [--force]                                   - Bootstrap SonarQube configuration and AI agent skill
  export                                           - Fetch issues, metrics, and quality gate via REST API
  sync                                             - Reconcile scan results into queue state
  status [--file <path>]                           - Show scan overview and queue lifecycle breakdown
  next [N] [--file <p>] [--rule <r>] [--severity <s>] - View next N prioritized pending issues (read-only)
  claim <k>                                        - Claim an issue (transitions pending -> investigating)
  claim-next [N] [--file <p>] [--rule <r>]         - Claim the next N prioritized issues
  resolve <k> [notes]                              - Mark issue as fixed (awaiting verification scan)
  wontfix <k> <reason>                             - Mark issue as wont-fix (reason required)
  falsepositive <k> <reason>                       - Mark issue as false-positive (reason required)
  defer <k> <reason>                               - Mark issue as deferred (reason required)
  reset <k>                                        - Reset an investigating/fixed issue to pending
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
