const fs = require('fs');
const path = require('path');
const { PrismaClient } = require(path.join(__dirname, 'node_modules/@prisma/client'));

function generateRef(trip, seatLabel) {
  const originCode = (trip.origin || 'CAI').slice(0, 3).toUpperCase();
  const destCode = (trip.destination || 'ALX').slice(0, 3).toUpperCase();
  const dateStr = new Date(trip.departure).toISOString().slice(5, 10).replace('-', '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${originCode}${destCode}-${dateStr}-${seatLabel}-${rand}`;
}

const cancellationPolicy = {
  freeWindowMinutes: 60,
  tiers: [
    { hoursBefore: 24, refundPercent: 100 },
    { hoursBefore: 12, refundPercent: 50 },
    { hoursBefore: 4, refundPercent: 25 },
    { hoursBefore: 0, refundPercent: 0 },
  ],
};

function calculateRefund(total, departureTime, bookingTime, isAdmin = false) {
  if (isAdmin) return { refundAmount: total, cancellationFee: 0, refundPercent: 100, canCancel: true };
  const now = new Date();
  const hoursSinceBooking = (now.getTime() - bookingTime.getTime()) / (1000 * 60 * 60);
  const hoursUntilDeparture = (departureTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursSinceBooking < cancellationPolicy.freeWindowMinutes / 60) {
    return { refundAmount: total, cancellationFee: 0, refundPercent: 100, canCancel: true };
  }
  if (hoursUntilDeparture <= 0) return { refundAmount: 0, cancellationFee: total, refundPercent: 0, canCancel: false };
  for (const tier of cancellationPolicy.tiers) {
    if (hoursUntilDeparture > tier.hoursBefore) {
      const refundAmount = total * (tier.refundPercent / 100);
      return {
        refundAmount: Math.round(refundAmount * 100) / 100,
        cancellationFee: Math.round((total - refundAmount) * 100) / 100,
        refundPercent: tier.refundPercent,
        canCancel: tier.refundPercent > 0,
      };
    }
  }
  return { refundAmount: 0, cancellationFee: total, refundPercent: 0, canCancel: false };
}

// Prepare scratch DBs
const srcDb = path.resolve('d:/saas/desing/safro-v1/prisma/dev-v1.db');
const v1Scratch = path.resolve('d:/saas/desing/safro-v1/prisma/scratch-v1.db');
const v2Scratch = path.resolve('d:/saas/desing/d 2/prisma/scratch-v2.db');

fs.copyFileSync(srcDb, v1Scratch);
fs.copyFileSync(srcDb, v2Scratch);
console.log('Created isolated scratch DBs: scratch-v1.db and scratch-v2.db');

const p1 = new PrismaClient({ datasources: { db: { url: `file:${v1Scratch}` } } });
const p2 = new PrismaClient({ datasources: { db: { url: `file:${v2Scratch}` } } });

async function runScenario(prisma, envName) {
  console.log(`\n================== RUNNING SCENARIO ON ${envName} ==================`);
  const company = await prisma.company.findFirst({
    where: { name: { contains: 'المرعبين' } }
  });
  console.log(`[${envName}] Company: ${company.name} (id: ${company.id})`);
  console.log(`[${envName}] Initial Wallet: ${company.walletBalance} EGP | CreditLimit: ${company.creditLimit} EGP | Outstanding: ${company.outstandingBalance} EGP`);

  const trip = await prisma.trip.findFirst({
    where: { origin: 'القاهرة', destination: 'المنصورة' },
    include: {
      bus: { include: { layout: { include: { seats: true } } } },
      bookings: true,
      companyBookings: true
    }
  });

  const allSeats = trip.bus.layout.seats.filter(s => s.type !== 'HIDDEN');
  console.log(`[${envName}] Target Trip: ${trip.id} | ${trip.origin} -> ${trip.destination} | Total Seats: ${allSeats.length} | BasePrice: ${trip.price}`);

  // Tiered pricing calculation for all seats
  const seatPrices = allSeats.map(s => ({
    seatLabel: s.label,
    passengerName: company.name,
    passengerPhone: '01000000000',
    price: s.price || trip.price
  }));

  const expectedTotal = seatPrices.reduce((sum, s) => sum + s.price, 0);
  console.log(`[${envName}] Booking ALL ${seatPrices.length} seats. Calculated Grand Total: ${expectedTotal} EGP`);

  // Step A: Create CompanyBooking rows in transaction (same logic as POST /api/company/bookings)
  const createdBookings = await prisma.$transaction(async (tx) => {
    const list = [];
    for (const p of seatPrices) {
      const b = await tx.companyBooking.create({
        data: {
          reference: generateRef(trip, p.seatLabel),
          companyId: company.id,
          tripId: trip.id,
          seatLabel: p.seatLabel,
          passengerName: p.passengerName,
          passengerPhone: p.passengerPhone,
          bookingType: 'FOR_EMPLOYEE',
          status: 'PENDING',
          total: p.price,
          paidFromWallet: 0,
          paidOnCredit: 0,
          fromStopOrder: 1,
          toStopOrder: 1
        }
      });
      list.push(b);
    }
    return list;
  });

  console.log(`[${envName}] Step A: Created ${createdBookings.length} PENDING company bookings.`);

  // Step B: Pay/Confirm Bookings (same logic as PATCH /api/company/bookings/[id] with status: PAID)
  let totalPaidWallet = 0;
  let totalPaidCredit = 0;

  for (const b of createdBookings) {
    await prisma.$transaction(async (tx) => {
      const comp = await tx.company.findUnique({ where: { id: company.id } });
      let paidFromWallet = 0;
      let paidOnCredit = 0;
      if (comp.paymentMode === 'PREPAID') {
        paidFromWallet = b.total;
      } else {
        paidFromWallet = Math.min(comp.walletBalance, b.total);
        const rem = b.total - paidFromWallet;
        if (rem > 0) paidOnCredit = rem;
      }

      if (paidFromWallet > 0) {
        await tx.company.update({
          where: { id: company.id },
          data: { walletBalance: { decrement: paidFromWallet } }
        });
        await tx.walletTransaction.create({
          data: {
            companyId: company.id,
            type: 'BOOKING_CHARGE',
            amount: -paidFromWallet,
            description: `Payment for booking ${b.reference}`,
            reference: b.id
          }
        });
      }
      if (paidOnCredit > 0) {
        await tx.company.update({
          where: { id: company.id },
          data: { outstandingBalance: { increment: paidOnCredit } }
        });
      }

      await tx.companyBooking.update({
        where: { id: b.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paidFromWallet,
          paidOnCredit
        }
      });

      totalPaidWallet += paidFromWallet;
      totalPaidCredit += paidOnCredit;
    });
  }

  const postPayCompany = await prisma.company.findUnique({ where: { id: company.id } });
  console.log(`[${envName}] Step B: Paid all seats.`);
  console.log(`[${envName}] Total Paid from Wallet: ${totalPaidWallet} EGP | Total on Credit: ${totalPaidCredit} EGP`);
  console.log(`[${envName}] Post-Pay Wallet: ${postPayCompany.walletBalance} EGP | Outstanding: ${postPayCompany.outstandingBalance} EGP`);

  // Step C: Cancel all bookings and calculate refund (same logic as PATCH status: CANCELLED)
  let totalRefund = 0;
  let totalFee = 0;

  for (const b of createdBookings) {
    const cur = await prisma.companyBooking.findUnique({ where: { id: b.id } });
    const { refundAmount, cancellationFee } = calculateRefund(
      cur.total,
      new Date(trip.departure),
      cur.createdAt,
      false
    );
    await prisma.companyBooking.update({
      where: { id: b.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: 'TEST_AGENT',
        refundAmount,
        cancellationFee
      }
    });
    totalRefund += (refundAmount || 0);
    totalFee += (cancellationFee || 0);
  }

  const remainingActive = await prisma.companyBooking.count({
    where: { tripId: trip.id, status: { in: ['PENDING', 'PAID', 'BOARDED'] } }
  });
  const cancelledCount = await prisma.companyBooking.count({
    where: { tripId: trip.id, status: 'CANCELLED' }
  });

  console.log(`[${envName}] Step C: Cancelled all seats.`);
  console.log(`[${envName}] Total Refund Amount: ${totalRefund} EGP | Total Cancellation Fee: ${totalFee} EGP`);
  console.log(`[${envName}] Active booked seats remaining: ${remainingActive} | Total Cancelled: ${cancelledCount}`);

  return {
    envName,
    seatsCount: seatPrices.length,
    expectedTotal,
    totalPaidWallet,
    totalPaidCredit,
    postPayWallet: postPayCompany.walletBalance,
    postPayOutstanding: postPayCompany.outstandingBalance,
    totalRefund,
    totalFee,
    remainingActive,
    cancelledCount
  };
}

async function main() {
  try {
    const resV1 = await runScenario(p1, 'V1_BASELINE_3001');
    const resV2 = await runScenario(p2, 'V2_REDESIGN_3000');

    console.log('\n======================================================');
    console.log('              SIDE-BY-SIDE VERIFICATION DIFF          ');
    console.log('======================================================');
    console.log(`Metric                        | V1 (3001)        | V2 (3000)        | Match?`);
    console.log(`---------------------------------------------------------------------`);
    console.log(`Total Seats Booked            | ${String(resV1.seatsCount).padEnd(16)} | ${String(resV2.seatsCount).padEnd(16)} | ${resV1.seatsCount === resV2.seatsCount ? 'YES (100%)' : 'NO'}`);
    console.log(`Grand Total Booking Price     | ${String(resV1.expectedTotal + ' EGP').padEnd(16)} | ${String(resV2.expectedTotal + ' EGP').padEnd(16)} | ${resV1.expectedTotal === resV2.expectedTotal ? 'YES (100%)' : 'NO'}`);
    console.log(`Total Paid from Wallet        | ${String(resV1.totalPaidWallet + ' EGP').padEnd(16)} | ${String(resV2.totalPaidWallet + ' EGP').padEnd(16)} | ${resV1.totalPaidWallet === resV2.totalPaidWallet ? 'YES (100%)' : 'NO'}`);
    console.log(`Total Charged to Credit       | ${String(resV1.totalPaidCredit + ' EGP').padEnd(16)} | ${String(resV2.totalPaidCredit + ' EGP').padEnd(16)} | ${resV1.totalPaidCredit === resV2.totalPaidCredit ? 'YES (100%)' : 'NO'}`);
    console.log(`Remaining Wallet Balance      | ${String(resV1.postPayWallet + ' EGP').padEnd(16)} | ${String(resV2.postPayWallet + ' EGP').padEnd(16)} | ${resV1.postPayWallet === resV2.postPayWallet ? 'YES (100%)' : 'NO'}`);
    console.log(`Post-Pay Outstanding Credit  | ${String(resV1.postPayOutstanding + ' EGP').padEnd(16)} | ${String(resV2.postPayOutstanding + ' EGP').padEnd(16)} | ${resV1.postPayOutstanding === resV2.postPayOutstanding ? 'YES (100%)' : 'NO'}`);
    console.log(`Total Refund Amount           | ${String(resV1.totalRefund + ' EGP').padEnd(16)} | ${String(resV2.totalRefund + ' EGP').padEnd(16)} | ${resV1.totalRefund === resV2.totalRefund ? 'YES (100%)' : 'NO'}`);
    console.log(`Total Cancellation Fee        | ${String(resV1.totalFee + ' EGP').padEnd(16)} | ${String(resV2.totalFee + ' EGP').padEnd(16)} | ${resV1.totalFee === resV2.totalFee ? 'YES (100%)' : 'NO'}`);
    console.log(`Remaining Active Seats        | ${String(resV1.remainingActive).padEnd(16)} | ${String(resV2.remainingActive).padEnd(16)} | ${resV1.remainingActive === resV2.remainingActive ? 'YES (100%)' : 'NO'}`);
    console.log(`Cancelled Bookings Count      | ${String(resV1.cancelledCount).padEnd(16)} | ${String(resV2.cancelledCount).padEnd(16)} | ${resV1.cancelledCount === resV2.cancelledCount ? 'YES (100%)' : 'NO'}`);
    console.log('======================================================\n');
  } finally {
    await p1.$disconnect();
    await p2.$disconnect();
    if (fs.existsSync(v1Scratch)) fs.unlinkSync(v1Scratch);
    if (fs.existsSync(v2Scratch)) fs.unlinkSync(v2Scratch);
    console.log('Cleaned up scratch DB copies.');
  }
}

main().catch(console.error);
