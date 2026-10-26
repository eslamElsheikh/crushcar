/**
 * The production boot check for session secrets.
 *
 * NextAuth signs session cookies with AUTH_SECRET. A secret that is missing,
 * short, or the value shipped in .env.example means either "no sessions at all"
 * or "every session cookie is signed with a key that is public knowledge" — and
 * nothing in the request path notices. So the app refuses to boot instead.
 *
 * It only ever fails a *production* process. Development, test and the e2e
 * harness all run with NODE_ENV other than 'production' and are unaffected.
 */

/** The placeholders shipped in .env.example — never a usable secret. */
export const EXAMPLE_SECRETS: readonly string[] = [
  'safrotravel-secret-key-change-in-production-abc123xyz',
  'your-secret-here',
  'changeme',
  'secret',
  'password',
];

/** Shortest secret that is accepted: 32 bytes of key material. */
export const MIN_SECRET_LENGTH = 32;

export interface SecretProblem {
  name: string;
  reason: string;
}

/**
 * Checks one secret. Returns null when it is usable, otherwise why it is not.
 * Kept pure so the verify script can enumerate every branch without booting.
 */
export function checkSecret(
  name: string,
  value: string | undefined | null
): SecretProblem | null {
  const trimmed = (value ?? '').trim();

  if (!trimmed) {
    return { name, reason: 'missing' };
  }

  const lowered = trimmed.toLowerCase();
  for (const example of EXAMPLE_SECRETS) {
    if (lowered === example || lowered.includes(example)) {
      return { name, reason: 'set to an example/placeholder value' };
    }
  }

  if (trimmed.length < MIN_SECRET_LENGTH) {
    return {
      name,
      reason: `only ${trimmed.length} characters, needs at least ${MIN_SECRET_LENGTH}`,
    };
  }

  return null;
}

/**
 * Every session secret the app accepts, in the order NextAuth reads them.
 * NEXTAUTH_SECRET is the alias Auth.js prefers; AUTH_SECRET is this app's
 * name for it (and the one .env carries).
 */
const SECRET_NAMES = ['AUTH_SECRET', 'NEXTAUTH_SECRET'] as const;

/**
 * Returns every problem with the secrets in `env`. An empty array means the
 * process may boot.
 */
export function collectSecretProblems(
  env: Record<string, string | undefined> = process.env
): SecretProblem[] {
  const problems: SecretProblem[] = [];

  const values = SECRET_NAMES.map((name) => ({
    name,
    value: env[name],
  }));

  const present = values.filter(
    (entry) => (entry.value ?? '').trim().length > 0
  );

  if (present.length === 0) {
    // Neither alias is set: report the one the app documents, once.
    problems.push({ name: 'AUTH_SECRET', reason: 'missing' });
    return problems;
  }

  for (const entry of values) {
    // Auth.js falls through AUTH_SECRET -> NEXTAUTH_SECRET, so an unset
    // alias is not a problem on its own. Only a *set* one has to be
    // usable, and a set one that fails must never be silently skipped.
    if ((entry.value ?? '').trim().length === 0) continue;

    const problem = checkSecret(entry.name, entry.value);
    if (problem) problems.push(problem);
  }

  return problems;
}

/** The message a failing boot prints. Shown verbatim in the report. */
export function describeFailure(problems: SecretProblem[]): string {
  const lines = problems.map((p) => `  - ${p.name}: ${p.reason}`);
  return [
    'Refusing to start: the session secret is not usable in production.',
    ...lines,
    '',
    'Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    'and put it in AUTH_SECRET (see .env.example).',
  ].join('\n');
}

/**
 * Throws when a production process has no usable session secret.
 * No-op in development and test, so the e2e suite is untouched.
 */
export function assertProductionSecrets(
  env: Record<string, string | undefined> = process.env
): void {
  if (env.NODE_ENV !== 'production') return;

  const problems = collectSecretProblems(env);
  if (problems.length > 0) {
    throw new Error(describeFailure(problems));
  }
}
