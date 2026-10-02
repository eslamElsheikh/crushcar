import { prisma } from '@/lib/prisma';

// Seeds the four launch destinations. Live-safe: upsert by slug with an EMPTY
// update clause — re-runs only INSERT missing rows and NEVER modify, rename,
// reorder, or delete anything an admin has changed. Never run at startup;
// execute manually once per environment.
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
      update: {},
      create: { ...r, isActive: true },
    });
  }
  const count = await prisma.destination.count();
  console.log('destinations=' + count);
  await prisma.$disconnect();
}

main();
