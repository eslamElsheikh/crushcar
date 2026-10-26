/**
 * Runs once when the server process starts — before the first request.
 *
 * This is where the production secret check lives: a misconfigured deploy
 * should die at boot, not serve sessions signed with a public key. See
 * src/lib/env-guard.ts for the rules.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;

  const { assertProductionSecrets } = await import('@/lib/env-guard');
  assertProductionSecrets();
}
