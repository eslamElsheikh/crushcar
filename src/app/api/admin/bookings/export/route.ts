import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import ExcelJS from 'exceljs'
import { neutralizeCsvCell } from '@/lib/csv'
import { bookingStatusLabel } from '@/lib/booking-status'
import { routeLabel } from '@/lib/route-label'

export const dynamic = 'force-dynamic'

const ROW_CAP = 5000

function formatDateCairo(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function formatTimeCairo(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const tab = searchParams.get('tab') === 'company' ? 'company' : 'customer'
    const q = searchParams.get('q') || ''
    const ref = searchParams.get('reference') || ''

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'SafroTravel Admin'
    workbook.created = new Date()

    if (tab === 'company') {
      // Build where clause
      const where: any = {}
      if (q) {
        where.OR = [
          { passengerName: { contains: q } },
          { passengerPhone: { contains: q } },
          { reference: { contains: q } },
          { company: { name: { contains: q } } },
        ]
      }
      if (ref) {
        where.reference = { contains: ref }
      }

      // Check row count against cap
      const count = await prisma.companyBooking.count({ where })
      if (count > ROW_CAP) {
        return NextResponse.json(
          {
            error: 'ROW_CAP_EXCEEDED',
            message: `عدد الحجوزات المطابقة (${count}) يتجاوز الحد الأقصى للتصدير (${ROW_CAP} حجز). يرجى تضييق نطاق البحث أو التواريخ.`,
          },
          { status: 400 }
        )
      }

      const bookings = await prisma.companyBooking.findMany({
        where,
        include: {
          company: true,
          trip: true,
          createdBy: { select: { name: true, email: true } },
          customer: true,
        },
        orderBy: { createdAt: 'desc' },
        take: ROW_CAP,
      })

      const sheet = workbook.addWorksheet('حجوزات الشركات', {
        views: [{ rightToLeft: true }],
      })

      sheet.columns = [
        { header: 'رقم الحجز', key: 'reference', width: 22 },
        { header: 'الشركة', key: 'companyName', width: 24 },
        { header: 'اسم المسافر', key: 'passengerName', width: 22 },
        { header: 'رقم الهاتف', key: 'passengerPhone', width: 18 },
        { header: 'الفندق', key: 'hotel', width: 20 },
        { header: 'مبلغ التحصيل (ج.م)', key: 'collectAmount', width: 18 },
        { header: 'خط السير', key: 'route', width: 28 },
        { header: 'تاريخ السفر', key: 'travelDate', width: 16 },
        { header: 'وقت المغادرة', key: 'departureTime', width: 16 },
        { header: 'المقعد', key: 'seatLabel', width: 12 },
        { header: 'نوع الرحلة', key: 'tripType', width: 16 },
        { header: 'مجموعة الذهاب والعودة', key: 'roundTripGroupId', width: 25 },
        { header: 'الإجمالي (ج.م)', key: 'total', width: 16 },
        { header: 'خصم من المحفظة', key: 'paidFromWallet', width: 18 },
        { header: 'على الائتمان', key: 'paidOnCredit', width: 18 },
        { header: 'الحالة', key: 'status', width: 16 },
        { header: 'أنشأه', key: 'createdBy', width: 22 },
        { header: 'تاريخ الحجز', key: 'createdAt', width: 20 },
      ]

      // Format header row
      const headerRow = sheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0B1B33' },
      }
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

      for (const b of bookings) {
        const roundTripLabel = b.roundTripGroupId ? 'ذهاب وعودة' : 'ذهاب فقط'
        const route = routeLabel(b.trip?.origin, b.trip?.destination, true)

        sheet.addRow({
          reference: neutralizeCsvCell(b.reference),
          companyName: neutralizeCsvCell(b.company?.name || ''),
          passengerName: neutralizeCsvCell(b.passengerName),
          passengerPhone: neutralizeCsvCell(b.passengerPhone),
          hotel: neutralizeCsvCell(b.passengerHotel || '—'),
          collectAmount: b.collectAmount != null ? Number(b.collectAmount) : 0,
          route: neutralizeCsvCell(route),
          travelDate: formatDateCairo(b.trip?.departure),
          departureTime: formatTimeCairo(b.trip?.departure),
          seatLabel: neutralizeCsvCell(b.seatLabel),
          tripType: neutralizeCsvCell(roundTripLabel),
          roundTripGroupId: neutralizeCsvCell(b.roundTripGroupId || '—'),
          total: Number(b.total || 0),
          paidFromWallet: Number(b.paidFromWallet || 0),
          paidOnCredit: Number(b.paidOnCredit || 0),
          status: neutralizeCsvCell(bookingStatusLabel((k) => k, b.status)),
          createdBy: neutralizeCsvCell(b.createdBy?.name || b.createdBy?.email || 'الشركة نفسها'),
          createdAt: formatDateCairo(b.createdAt) + ' ' + formatTimeCairo(b.createdAt),
        })
      }
    } else {
      // Customer bookings
      const where: any = {}
      if (q) {
        where.OR = [
          { passengerName: { contains: q } },
          { passengerPhone: { contains: q } },
          { reference: { contains: q } },
        ]
      }
      if (ref) {
        where.reference = { contains: ref }
      }

      const count = await prisma.booking.count({ where })
      if (count > ROW_CAP) {
        return NextResponse.json(
          {
            error: 'ROW_CAP_EXCEEDED',
            message: `عدد الحجوزات المطابقة (${count}) يتجاوز الحد الأقصى للتصدير (${ROW_CAP} حجز). يرجى تضييق نطاق البحث أو التواريخ.`,
          },
          { status: 400 }
        )
      }

      const bookings = await prisma.booking.findMany({
        where,
        include: {
          trip: true,
          user: true,
          paymentMethodRef: true,
        },
        orderBy: { createdAt: 'desc' },
        take: ROW_CAP,
      })

      const sheet = workbook.addWorksheet('حجوزات العملاء', {
        views: [{ rightToLeft: true }],
      })

      sheet.columns = [
        { header: 'رقم الحجز', key: 'reference', width: 22 },
        { header: 'اسم المسافر', key: 'passengerName', width: 22 },
        { header: 'رقم الهاتف', key: 'passengerPhone', width: 18 },
        { header: 'خط السير', key: 'route', width: 28 },
        { header: 'تاريخ السفر', key: 'travelDate', width: 16 },
        { header: 'وقت المغادرة', key: 'departureTime', width: 16 },
        { header: 'المقعد', key: 'seatLabel', width: 12 },
        { header: 'الإجمالي (ج.م)', key: 'total', width: 16 },
        { header: 'طريقة الدفع', key: 'paymentMethod', width: 20 },
        { header: 'الحالة', key: 'status', width: 16 },
        { header: 'صعد الباص', key: 'boarded', width: 14 },
        { header: 'تاريخ الحجز', key: 'createdAt', width: 20 },
      ]

      const headerRow = sheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0B1B33' },
      }
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

      for (const b of bookings) {
        const route = routeLabel(b.trip?.origin, b.trip?.destination, true)
        const method = b.paymentMethodRef?.displayName || b.paymentMethod || '—'

        sheet.addRow({
          reference: neutralizeCsvCell(b.reference),
          passengerName: neutralizeCsvCell(b.passengerName),
          passengerPhone: neutralizeCsvCell(b.passengerPhone),
          route: neutralizeCsvCell(route),
          travelDate: formatDateCairo(b.trip?.departure),
          departureTime: formatTimeCairo(b.trip?.departure),
          seatLabel: neutralizeCsvCell(b.seatLabel),
          total: Number(b.total || 0),
          paymentMethod: neutralizeCsvCell(method),
          status: neutralizeCsvCell(bookingStatusLabel((k) => k, b.status)),
          boarded: b.status === 'BOARDED' || b.boarded ? 'نعم' : 'لا',
          createdAt: formatDateCairo(b.createdAt) + ' ' + formatTimeCairo(b.createdAt),
        })
      }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = `safrotravel-bookings-${tab}-${Date.now()}.xlsx`

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error', message: err?.message }, { status: 500 })
  }
}
