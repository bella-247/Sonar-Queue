import type readline from 'node:readline';

export const VALID_TOKEN_PREFIXES = ['sqp_', 'squ_', 'sqa_'] as const;
export type TokenPrefix = typeof VALID_TOKEN_PREFIXES[number];

export const TOKEN_PREFIX_DESCRIPTIONS: Record<TokenPrefix, string> = {
  sqp_: 'Project Analysis Token (recommended for this project)',
  squ_: 'User Token (carries user permissions)',
  sqa_: 'Global Analysis Token (multi-project analysis)',
};

export function getTokenPrefix(token: string): TokenPrefix | null {
  const trimmed = token.trim();
  for (const prefix of VALID_TOKEN_PREFIXES) {
    if (trimmed.startsWith(prefix)) return prefix;
  }
  return null;
}

export function isValidTokenFormat(token: string): boolean {
  const trimmed = token.trim();
  if (trimmed.length < 20) return false;
  return getTokenPrefix(trimmed) !== null;
}

export function maskToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}

export async function validateTokenWithServer(
  hostUrl: string,
  token: string
): Promise<{ reachable: boolean; valid: boolean; error?: string }> {
  try {
    const authHeader = 'Basic ' + Buffer.from(`${token}:`).toString('base64');
    const res = await fetch(`${hostUrl}/api/authentication/validate`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(5000),
    });

    if (res.status === 401 || res.status === 403) {
      return { reachable: true, valid: false, error: 'HTTP 401/403: Invalid credentials or expired token' };
    }

    if (!res.ok) {
      return { reachable: true, valid: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }

    const data = (await res.json()) as { valid?: boolean };
    return { reachable: true, valid: data.valid === true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { reachable: false, valid: false, error: message };
  }
}

function printTokenGuidance(hostUrl: string, projectKey: string): void {
  console.log('SonarQube tokens must have one of these valid prefixes:');
  for (const prefix of VALID_TOKEN_PREFIXES) {
    console.log(`  • ${prefix.padEnd(6)} — ${TOKEN_PREFIX_DESCRIPTIONS[prefix]}`);
  }
  console.log('');
  console.log('How to generate a project token in SonarQube:');
  console.log(`  1. Open: ${hostUrl}`);
  console.log(`  2. Navigate to your project: "${projectKey}"`);
  console.log('  3. Go to: Project Settings → Analysis Tokens');
  console.log('  4. Enter a name (e.g. "sonar-queue-cli"), click "Generate", and copy the token.');
  console.log('');
}

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export async function promptAndVerifyToken(
  rl: readline.Interface,
  hostUrl: string,
  projectKey: string,
  existingToken?: string
): Promise<string> {
  const hasExistingValid = existingToken ? isValidTokenFormat(existingToken) : false;

  printTokenGuidance(hostUrl, projectKey);

  while (true) {
    const promptLabel = hasExistingValid
      ? `SonarQube Token [${maskToken(existingToken!)}]: `
      : 'SonarQube Token (starts with sqp_): ';

    const rawInput = await askQuestion(rl, promptLabel);
    const input = rawInput.trim();

    if (!input && hasExistingValid) {
      return existingToken!;
    }

    if (!input) {
      console.log('  ⚠ Token cannot be empty. Please enter your SonarQube analysis token.\n');
      continue;
    }

    const prefix = getTokenPrefix(input);
    if (!prefix) {
      console.log('\n  ✗ Invalid token prefix!');
      console.log('    SonarQube tokens must begin with "sqp_", "squ_", or "sqa_".');
      console.log('    Example: sqp_0123456789abcdef0123456789abcdef01234567\n');
      continue;
    }

    if (input.length < 20) {
      console.log('\n  ✗ Token is too short. SonarQube tokens are typically 44 characters long.\n');
      continue;
    }

    console.log(`  Format verified: ${TOKEN_PREFIX_DESCRIPTIONS[prefix]}`);
    process.stdout.write('  Validating token with server... ');

    const check = await validateTokenWithServer(hostUrl, input);
    if (check.reachable) {
      if (check.valid) {
        console.log('✓ Token active & verified!');
        return input;
      }
      console.log(`✗ Rejected (${check.error || 'invalid'}).`);
      const answer = await askQuestion(rl, '  Save this token anyway? [y/N]: ');
      if (answer.trim().toLowerCase() === 'y') {
        return input;
      }
      console.log('');
    } else {
      console.log('ℹ Server not reachable yet (token format accepted).');
      console.log('  Run "sonar-queue start" and "sonar-queue doctor" after setup.\n');
      return input;
    }
  }
}
