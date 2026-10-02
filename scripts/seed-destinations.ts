import { prisma } from '@/lib/prisma';

// Seeds the four launch destinations. Safe to re-run (upsert by slug).
const rows = [
  { slug: 'aswan', nameAr: 'أسوان', nameEn: 'Aswan', sortOrder: 1, imageUrl: '/destinations/aswan.jpg' },
  { slug: 'luxor', nameAr: 'الأقصر', nameEn: 'Luxor', sortOrder: 2, imageUrl: '/destinations/luxor.jpg' },
  { slug: 'alexandria', nameAr: 'الإسكندرية', nameEn: 'Alexandria', sortOrder: 3, imageUrl: '/destinations/alexandria.jpg' },
  { slug: 'ismailia', nameAr: 'الإسماعيلية', nameEn: 'Ismailia', sortOrder: 4, imageUrl: '/destinations/ismailia.jpg' },
];

async function main() {
  for (const r of rows) {
    await prisma.destination.upsert({
      where: { slug: r.slug },
      update: { nameAr: r.nameAr, nameEn: r.nameEn, sortOrder: r.sortOrder, imageUrl: r.imageUrl },
      create: { ...r, isActive: true },
    });
  }
  const count = await prisma.destination.count();
  console.log('destinations=' + count);
  await prisma.$disconnect();
}

main();
