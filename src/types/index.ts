export type Role = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'CUSTOMER'
export type Plan = 'STARTER' | 'PRO' | 'ENTERPRISE'
export type BusType = 'MINI_BUS' | 'COACH_BUS' | 'VIP_BUS' | 'DOUBLE_DECKER'
export type SeatType = 'NORMAL' | 'VIP' | 'DISABLED' | 'HIDDEN'
export type TripStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type BookingStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'BOARDED'
export type PaymentMode = 'CREDIT' | 'PREPAID' | 'BOTH'
export type BillingCycle = 'MONTHLY' | 'WEEKLY'
export type BookingType = 'FOR_CLIENT' | 'FOR_EMPLOYEE'
export type WalletTransactionType = 'DEPOSIT' | 'BOOKING_CHARGE' | 'REFUND' | 'ADJUSTMENT'
export type InvoiceStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  companyId?: string
  company?: Company
}

export interface Company {
  id: string
  name: string
  subdomain: string
  plan: Plan
  creditLimit: number
  walletBalance: number
  paymentMode: PaymentMode
  outstandingBalance: number
  billingCycle: BillingCycle
  lastBillingDate?: string
  isActive: boolean
}

export interface Bus {
  id: string
  name: string
  type: BusType
  seatCount: number
  companyId: string
  company?: Company
  layout?: BusLayout
  stations?: BusStation[]
  trips?: Trip[]
}

export interface Station {
  id: string
  name: string
  city: string
  lat?: number
  lng?: number
}

export interface BusStation {
  id: string
  busId: string
  name: string
  order: number
}

export interface BusLayout {
  id: string
  busId: string
  rows: number
  cols: number
  seats: Seat[]
}

export interface Seat {
  id: string
  layoutId: string
  label: string
  row: number
  col: number
  type: SeatType
  price: number
}

export interface TripStop {
  id?: string
  tripId?: string
  stationId: string
  station?: Station
  stopOrder: number
  priceFromOrigin: number
  arrivalTime?: string
  departureTime?: string
}

export interface Trip {
  id: string
  busId: string
  bus?: Bus
  origin: string
  destination: string
  departure: string
  arrival: string
  price: number
  status: TripStatus
  stopsJson?: string
  tripStops?: TripStop[]
  stops?: TripStop[]
  calculatedPrice?: number
  boardingTime?: string
  alightingTime?: string
}

export interface Booking {
  id: string
  reference: string
  userId: string
  tripId: string
  trip?: Trip
  seatLabel: string
  status: BookingStatus
  total: number
  fromStopOrder?: number
  toStopOrder?: number
  roundTripGroupId?: string
  returnForId?: string
  passengerName?: string
}

export interface SeatStatus {
  label: string
  type: SeatType
  price: number
  available: boolean
}

export interface RoundTripSelection {
  outboundTripId: string
  outboundSeats: string[]
  returnTripId: string
  returnSeats: string[]
  outboundDate: string
  returnDate: string
}

export interface CompanyCustomer {
  id: string
  companyId: string
  name: string
  email?: string
  phone?: string
  notes?: string
  _count?: { bookings: number }
  createdAt: string
  updatedAt: string
}

export interface CompanyBooking {
  id: string
  reference: string
  companyId: string
  customerId?: string
  customer?: CompanyCustomer
  tripId: string
  trip?: Trip
  seatLabel: string
  passengerName: string
  passengerPhone: string
  bookingType: BookingType
  status: BookingStatus
  total: number
  paidFromWallet: number
  paidOnCredit: number
  fromStopOrder: number
  toStopOrder: number
  createdAt: string
  paidAt?: string
  cancelledAt?: string
  boardedAt?: string
}

export interface Invoice {
  id: string
  companyId: string
  company?: Company
  periodStart: string
  periodEnd: string
  totalAmount: number
  paidAmount: number
  status: InvoiceStatus
  dueDate: string
  paidAt?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface WalletTransaction {
  id: string
  companyId: string
  type: WalletTransactionType
  amount: number
  description: string
  reference?: string
  createdAt: string
}

export interface CompanyCreditStatus {
  company: Company
  availableCredit: number
  walletBalance: number
  outstandingBalance: number
  totalBookings: number
  totalSpent: number
}
