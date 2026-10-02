import fs from 'fs';
import crypto from 'crypto';

const filePath = process.argv[2] || 'prisma/dev.db';

try {
  // In Windows, opening with read stream / file descriptor using 'r' allows shared read
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  const digest = hash.digest('hex');
  console.log(`SHA256 (${filePath}): ${digest}`);
} catch (err) {
  console.error(`Error hashing ${filePath}:`, err.message);
}
