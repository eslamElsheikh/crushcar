const path = require('path');
const { PrismaClient } = require(path.join(__dirname, 'node_modules/@prisma/client'));

const dbPath = path.resolve('d:/saas/desing/safro-v1/prisma/dev-v1.db');
const p = new PrismaClient({
  datasources: { db: { url: `file:${dbPath}` } }
});

async function run() {
  const companies = await p.company.findMany();
  console.log('COMPANIES_COUNT:', companies.length);
  for (const c of companies) {
    console.log(`Company: ${c.id} | Name: ${c.name} | Wallet: ${c.walletBalance} | CreditLimit: ${c.creditLimit} | Outstanding: ${c.outstandingBalance}`);
  }

  const trips = await p.trip.findMany({
    include: {
      bus: { include: { layout: { include: { seats: true } } } },
      bookings: true,
      companyBookings: true,
      tripStops: true
    }
  });
  console.log('TRIPS_COUNT:', trips.length);
  for (const t of trips) {
    const seats = t.bus?.layout?.seats || [];
    const bCount = (t.bookings || []).length + (t.companyBookings || []).length;
    console.log(`Trip: ${t.id} | ${t.origin} -> ${t.destination} | BasePrice: ${t.price} | Seats: ${seats.length} | Booked: ${bCount}`);
    if (seats.length > 0) {
      console.log(`  Sample seat prices: ${seats.slice(0, 3).map(s => `${s.label}:${s.price}`).join(', ')}`);
    }
  }
}

run().catch(console.error).finally(() => p.$disconnect());
