import { prisma } from './prisma'
import { governoratesList } from './governorates'

export async function seedStations() {
  const count = await prisma.station.count()
  if (count > 0) return

  for (const g of governoratesList) {
    await prisma.station.upsert({
      where: { name_city: { name: g.label, city: g.label } },
      update: {},
      create: { name: g.label, city: g.label },
    })
  }
}

export async function getStations() {
  return prisma.station.findMany({ orderBy: { name: 'asc' } })
}

export async function getStationByName(name: string) {
  return prisma.station.findFirst({ where: { name } })
}

export async function getOrCreateStation(name: string, city?: string) {
  const existing = await prisma.station.findFirst({ where: { name } })
  if (existing) return existing
  return prisma.station.create({ data: { name, city: city || name } })
}
