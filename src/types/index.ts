export type Role = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'CUSTOMER'
export type Plan = 'STARTER' | 'PRO' | 'ENTERPRISE'
export type BusType = 'MINI_BUS' | 'COACH_BUS' | 'VIP_BUS' | 'DOUBLE_DECKER'
export type SeatType = 'NORMAL' | 'VIP' | 'DISABLED' | 'HIDDEN'
export type TripStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type BookingStatus = 'PENDING' | 'PAID' | 'CANCELLED'

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
}

export interface Bus {
  id: string
  name: string
  type: BusType
  seatCount: number
  companyId: string
  company?: Company
  layout?: BusLayout
  trips?: Trip[]
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

export interface Trip {
  id: string
  busId: string
  bus?: Bus
  origin: string
  destination: string
  departure: Date
  arrival: Date
  price: number
  status: TripStatus
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
}

export interface SeatStatus {
  label: string
  type: SeatType
  price: number
  available: boolean
}
