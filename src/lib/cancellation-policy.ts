export const cancellationPolicy = {
  freeWindowMinutes: 60,
  tiers: [
    { hoursBefore: 24, refundPercent: 100, label: { ar: 'إلغاء مجاني', en: 'Free cancellation' } },
    { hoursBefore: 12, refundPercent: 50, label: { ar: 'استرداد 50%', en: '50% refund' } },
    { hoursBefore: 4, refundPercent: 25, label: { ar: 'استرداد 25%', en: '25% refund' } },
    { hoursBefore: 0, refundPercent: 0, label: { ar: 'لا يوجد استرداد', en: 'No refund' } },
  ],
}

export function calculateRefund(total: number, departureTime: Date, bookingTime: Date, isAdmin = false) {
  if (isAdmin) {
    return { refundAmount: total, cancellationFee: 0, refundPercent: 100, canCancel: true }
  }

  const now = new Date()
  const hoursSinceBooking = (now.getTime() - bookingTime.getTime()) / (1000 * 60 * 60)
  const hoursUntilDeparture = (departureTime.getTime() - now.getTime()) / (1000 * 60 * 60)

  if (hoursSinceBooking < cancellationPolicy.freeWindowMinutes / 60) {
    return { refundAmount: total, cancellationFee: 0, refundPercent: 100, canCancel: true }
  }

  if (hoursUntilDeparture <= 0) {
    return { refundAmount: 0, cancellationFee: total, refundPercent: 0, canCancel: false }
  }

  for (const tier of cancellationPolicy.tiers) {
    if (hoursUntilDeparture > tier.hoursBefore) {
      const refundAmount = total * (tier.refundPercent / 100)
      return {
        refundAmount: Math.round(refundAmount * 100) / 100,
        cancellationFee: Math.round((total - refundAmount) * 100) / 100,
        refundPercent: tier.refundPercent,
        canCancel: tier.refundPercent > 0,
      }
    }
  }

  return { refundAmount: 0, cancellationFee: total, refundPercent: 0, canCancel: false }
}
