import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const governoratesList = [
  { value: 'cairo', label: 'القاهرة' },
  { value: 'alexandria', label: 'الإسكندرية' },
  { value: 'giza', label: 'الجيزة' },
  { value: 'asyut', label: 'أسيوط' },
  { value: 'port-said', label: 'بورسعيد' },
  { value: 'suez', label: 'السويس' },
  { value: 'ismailia', label: 'الإسماعيلية' },
  { value: 'faiyum', label: 'الفيوم' },
  { value: 'minya', label: 'المنيا' },
  { value: 'qena', label: 'قنا' },
  { value: 'sohag', label: 'سوهاج' },
  { value: 'bani-suef', label: 'بني سويف' },
  { value: 'tanta', label: 'طنطا' },
  { value: 'zagazig', label: 'الزقازيق' },
  { value: 'damanhur', label: 'دمنهور' },
  { value: 'shibin-el-kom', label: 'شبين الكوم' },
  { value: 'banha', label: 'بنها' },
  { value: 'mit-ghamr', label: 'ميت غمر' },
  { value: 'sharm-el-sheikh', label: 'شرم الشيخ' },
  { value: 'hurghada', label: 'الغردقة' },
  { value: 'luxor', label: 'الأقصر' },
  { value: 'aswan', label: 'أسوان' },
  { value: 'el-arish', label: 'العريش' },
  { value: 'kafr-el-sheikh', label: 'كفر الشيخ' },
  { value: 'menoufia', label: 'المنوفية' },
  { value: 'behira', label: 'البحيرة' },
  { value: 'gharbia', label: 'الغربية' },
  { value: 'qalyubia', label: 'القليوبية' },
  { value: 'new-valley', label: 'الوادي الجديد' },
  { value: 'matrouh', label: 'مرسى مطروح' },
  { value: 'red-sea', label: 'البحر الأحمر' },
  { value: 'south-sinai', label: 'جنوب سيناء' },
  { value: 'north-sinai', label: 'شمال سيناء' },
  { value: 'damietta', label: 'دمياط' },
  { value: 'mansoura', label: 'المنصوره' },
]

async function main() {
  const count = await prisma.station.count()
  if (count > 0) {
    console.log(`Station table already has ${count} records`)
    return
  }
  for (const g of governoratesList) {
    await prisma.station.upsert({
      where: { name_city: { name: g.label, city: g.label } },
      update: {},
      create: { name: g.label, city: g.label },
    })
  }
  const finalCount = await prisma.station.count()
  console.log(`Seeded ${finalCount} stations`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
