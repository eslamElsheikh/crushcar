// Builds deployment zips with FORWARD-SLASH entry names (PHP ZipArchive on
// Linux extracts Windows Compress-Archive zips as literal backslash filenames).
// Usage: node scripts/zip-deploy.mjs <output.zip> <dir> [prefix]
//   entries = <dir>/** with names [prefix/]<relpath with />.
// Pure Node (zlib deflate), no dependencies.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function dosTime(d) {
  return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
}
function dosDate(d) {
  return ((((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate())) & 0xffff;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'safrotravel' && e.isSymbolicLink()) continue; // npm worktree link -> project root
    // Never ship env files. .next/standalone/.env holds the LOCAL dev
    // DATABASE_URL, and extracting server.zip overwrites production's working
    // .env with it (that is exactly what happened on 2026-10-25; repair-env.php
    // had to restore it). Production owns its env files — this zip must not.
    if (/^\.env(\.|$)/.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

const [outZip, srcDir, prefix = ''] = process.argv.slice(2);
if (!outZip || !srcDir) {
  console.error('usage: node scripts/zip-deploy.mjs <output.zip> <dir> [prefix]');
  process.exit(2);
}
const root = path.resolve(srcDir);
const files = walk(root);
const chunks = []; // local headers + data
const central = [];
let offset = 0;
let n = 0;
for (const abs of files) {
  const rel = path.relative(root, abs).split(path.sep).join('/');
  const name = prefix ? prefix + '/' + rel : rel;
  const nameBuf = Buffer.from(name, 'utf8');
  const raw = fs.readFileSync(abs);
  const comp = zlib.deflateRawSync(raw, { level: 6 });
  const crc = crc32(raw);
  const st = fs.statSync(abs);
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0x0800, 6); // UTF-8
  lh.writeUInt16LE(8, 8); // deflate
  lh.writeUInt16LE(dosTime(st.mtime), 10);
  lh.writeUInt16LE(dosDate(st.mtime), 12);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(comp.length, 18);
  lh.writeUInt32LE(raw.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26);
  lh.writeUInt16LE(0, 28);
  chunks.push(lh, nameBuf, comp);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(63, 4); // made by unix
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0x0800, 8);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt16LE(dosTime(st.mtime), 12);
  cd.writeUInt16LE(dosDate(st.mtime), 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(comp.length, 20);
  cd.writeUInt32LE(raw.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt16LE(0, 30);
  cd.writeUInt16LE(0, 32);
  cd.writeUInt16LE(0, 34);
  cd.writeUInt16LE(0, 36);
  cd.writeUInt32LE(0, 38);
  cd.writeUInt32LE(offset, 42);
  central.push(cd, nameBuf);
  offset += lh.length + nameBuf.length + comp.length;
  if (++n % 4000 === 0) console.log(`  ...${n}/${files.length}`);
}
const cdStart = offset;
const cdSize = central.reduce((a, b) => a + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(n, 8);
end.writeUInt16LE(n, 10);
end.writeUInt32LE(cdSize, 12);
end.writeUInt32LE(cdStart, 16);
fs.writeFileSync(outZip, Buffer.concat([...chunks, ...central, end]));
console.log(`wrote ${outZip}: ${n} files, ${(fs.statSync(outZip).size / 1048576).toFixed(1)}MB`);
