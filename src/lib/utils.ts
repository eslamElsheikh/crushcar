import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const arabicToEnglish: Record<string, string> = {
  'القاهرة': 'CAI', 'الجيزة': 'GIZ', 'الإسكندرية': 'ALX', 'أسوان': 'ASW',
  'الدقهلية': 'DKT', 'الشرقية': 'SHQ', 'المنوفية': 'MNF', 'الغربية': 'GFR',
  'كفر الشيخ': 'KFS', 'الفيوم': 'FYM', 'بني سويف': 'BSW', 'المنيا': 'MNY',
  'أسيوط': 'AST', 'سوهاج': 'SOH', 'قنا': 'QNA', 'الأقصر': 'LXR',
  'الإسماعيلية': 'ISM', 'السويس': 'SUZ', 'بورسعيد': 'PSD',
  'دمياط': 'DMY', 'الزقازيق': 'ZKZ', 'طنطا': 'TNT', 'شبين الكوم': 'SKM',
  'رأس البر': 'RBR', 'العريش': 'ARS', 'مرسي مطروح': 'MRT',
}

function toCode(name: string): string {
  const clean = name.trim()
  if (arabicToEnglish[clean]) return arabicToEnglish[clean]
  const code = clean.substring(0, 3).toUpperCase()
  if (/[A-Z0-9]/.test(code)) return code
  const hash = clean.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return String.fromCharCode(65 + (hash % 26)) + String.fromCharCode(65 + ((hash * 7) % 26)) + String.fromCharCode(65 + ((hash * 13) % 26))
}

export function generateRef(trip?: { origin: string; destination: string; bus: { name: string } }, seatLabel?: string): string {
  const prefix = 'CC'
  const city = trip ? toCode(trip.origin) : 'CAI'
  const dest = trip ? toCode(trip.destination) : 'ALX'
  const seat = seatLabel ? seatLabel.toUpperCase().replace(/[^A-Z0-9]/g, '') : 'S1'
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `${prefix}-${city}-${dest}-${seat}-${rand}`
}
