// TEMP seed-safety test — deleted after execution.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Simulate an admin edit of an existing row.
  await prisma.destination.update({
    where: { slug: 'aswan' },
    data: { nameAr: 'أسوان-معدلة-باليوم', imageUrl: '/custom/admin-image.jpg', sortOrder: 99 },
  });

  // Re-run the seed logic (exactly what seed-destinations.ts does now).
  const rows = [
    { slug: 'aswan', nameAr: 'أسوان', nameEn: 'Aswan', sortOrder: 1, imageUrl: '/destinations/aswan.jpg' },
    { slug: 'luxor', nameAr: 'الأقصر', nameEn: 'Luxor', sortOrder: 2, imageUrl: '/destinations/luxor.jpg' },
    { slug: 'alexandria', nameAr: 'الإسكندرية', nameEn: 'Alexandria', sortOrder: 3, imageUrl: '/destinations/alexandria.jpg' },
    { slug: 'ismailia', nameAr: 'الإسماعيلية', nameEn: 'Ismailia', sortOrder: 4, imageUrl: '/destinations/ismailia.jpg' },
  ];
  for (const r of rows) {
    await prisma.destination.upsert({ where: { slug: r.slug }, update: {}, create: { ...r, isActive: true } });
  }

  const count = await prisma.destination.count();
  const aswan = await prisma.destination.findUnique({ where: { slug: 'aswan' } });
  console.log('COUNT:', count);
  console.log('ASWAN_UNTOUCHED:', aswan?.nameAr === 'أسوان-معدلة-باليوم' && aswan.imageUrl === '/custom/admin-image.jpg' && aswan.sortOrder === 99);

  // Restore the row so the dev DB stays clean.
  await prisma.destination.update({
    where: { slug: 'aswan' },
    data: { nameAr: 'أسوان', nameEn: 'Aswan', sortOrder: 1, imageUrl: '/destinations/aswan.jpg' },
  });
}

main().finally(() => prisma.$disconnect());
