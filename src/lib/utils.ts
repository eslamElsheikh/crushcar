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

export function localizeUploadError(err: string | null | undefined, isRTL: boolean = true): string {
  if (!err) return isRTL ? 'فشل رفع الملف' : 'Upload failed';
  if (!isRTL) return err;
  const lower = err.toLowerCase();
  if (lower.includes('between 1 byte and 5 mb') || lower.includes('size')) {
    return 'حجم الصورة يجب أن يكون بين 1 بايت و 5 ميجابايت';
  }
  if (lower.includes('too large') || lower.includes('maximum 2mb')) {
    return 'حجم الملف كبير جداً (الحد الأقصى 2 ميجابايت)';
  }
  if (lower.includes('only jpeg, png, webp') || lower.includes('allowed: png, jpg, webp') || lower.includes('invalid file type')) {
    return 'صيغة الملف غير مدعومة (يسمح فقط بـ JPG, PNG, WebP)';
  }
  if (lower.includes('not a valid image') || lower.includes('file content is not a valid image')) {
    return 'الملف المرفوع ليس صورة صالحة';
  }
  if (lower.includes('network error')) {
    return 'خطأ في الاتصال بالشبكة أثناء الرفع';
  }
  if (lower.includes('no file uploaded') || lower.includes('image file is required')) {
    return 'يرجى اختيار ملف للصورة';
  }
  return err;
}
