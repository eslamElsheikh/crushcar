// One-off backfill: set imageUrl for destinations missing it (from local governorate map).
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const BY_SLUG = {
  'demo-dest-aswan': '/destinations/aswan.jpg',
  'demo-dest-luxor': '/destinations/luxor.jpg',
  'demo-dest-sharm': '/destinations/sharm-el-sheikh.jpg',
  'demo-dest-hurghada': '/destinations/hurghada.jpg',
  'demo-dest-sahl-hashish': '/destinations/sahl-hashish.jpg',
  'demo-dest-sokhna': '/destinations/sokhna.jpg',
  'demo-dest-dahab': '/destinations/dahab.jpg',
};

(async () => {
  const missing = await p.destination.findMany({ where: { imageUrl: null } });
  console.log('missing: ' + missing.map((d) => d.slug).join(', '));
  for (const d of missing) {
    const url = BY_SLUG[d.slug];
    if (!url) { console.log('SKIP (no map) ' + d.slug); continue; }
    await p.destination.update({ where: { id: d.id }, data: { imageUrl: url } });
    console.log('OK ' + d.slug + ' -> ' + url);
  }
  const all = await p.destination.findMany({ orderBy: { sortOrder: 'asc' }, select: { slug: true, nameAr: true, imageUrl: true } });
  console.log(JSON.stringify(all, null, 2));
  await p.$disconnect();
})().catch(async (e) => { console.error(e); await p.$disconnect(); process.exit(1); });
