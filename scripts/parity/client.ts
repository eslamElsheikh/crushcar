/**
 * Isolated Prisma client for the parity harness.
 *
 * The repository's node_modules holds a client generated from the MySQL schema,
 * because that is what production runs, and that client refuses to open a SQLite
 * file. Regenerating node_modules here would silently change the client the main
 * checkout builds production with, so the harness generates its own SQLite
 * client into a gitignored folder next to itself.
 *
 * The generated folder does not exist in a fresh clone, and this file is part of
 * the project-wide typecheck that `next build` runs, so it is loaded with
 * require() and a loose cast rather than a static import. Otherwise the app build
 * would fail on a machine that never ran the harness.
 *
 * Generate it first with: npm run check:parity:gen
 */

/* eslint-disable @typescript-eslint/no-var-requires */
let PrismaClientCtor: any;
try {
  ({ PrismaClient: PrismaClientCtor } = require('./.generated/index.js'));
} catch {
  console.error(
    'The parity harness client is missing. Run: npm run check:parity:gen',
  );
  process.exit(2);
}

export const prisma = new PrismaClientCtor({
  log: [{ emit: 'event', level: 'query' }],
});

let queryCount = 0;
prisma.$on('query', () => { queryCount++; });

export function queriesSoFar(): number {
  return queryCount;
}

export function resetQueryCount(): void {
  queryCount = 0;
}