/**
 * Isolated Prisma client for the parity harness.
 *
 * The repository's node_modules holds a client generated from the MySQL schema,
 * because that is what production runs, and that client refuses to open a SQLite
 * file. Regenerating node_modules here would silently change the client the main
 * checkout builds production with, so the harness generates its own SQLite
 * client into a gitignored folder next to itself.
 *
 * Regenerate with: npm run check:parity:gen
 */
import { PrismaClient } from './.generated/index.js';

export const prisma = new PrismaClient({
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