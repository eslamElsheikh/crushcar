import { prisma } from './prisma'

export async function autoTransitionTripStatus(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } })
  if (!trip) return

  const now = new Date()
  const departure = new Date(trip.departure)
  const arrival = new Date(trip.arrival)

  let newStatus: string | null = null

  if (trip.status === 'CANCELLED') return

  if (trip.status === 'COMPLETED') return

  if (trip.status === 'SCHEDULED' && now >= departure && now < arrival) {
    newStatus = 'IN_PROGRESS'
  } else if (trip.status === 'IN_PROGRESS' && now >= arrival) {
    newStatus = 'COMPLETED'
  }

  if (newStatus) {
    await prisma.trip.update({
      where: { id: tripId },
      data: { status: newStatus },
    })
  }
}

export async function autoTransitionAllTrips() {
  const now = new Date()

  // SCHEDULED → IN_PROGRESS
  await prisma.trip.updateMany({
    where: {
      status: 'SCHEDULED',
      departure: { lte: now },
    },
    data: { status: 'IN_PROGRESS' },
  })

  // IN_PROGRESS → COMPLETED
  await prisma.trip.updateMany({
    where: {
      status: 'IN_PROGRESS',
      arrival: { lte: now },
    },
    data: { status: 'COMPLETED' },
  })
}