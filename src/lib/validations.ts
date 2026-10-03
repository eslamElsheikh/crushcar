import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('البريد الإلكتروني غير صحيح'),
  password: z
    .string()
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .regex(/[A-Z]/, 'يجب أن تحتوي كلمة المرور على حرف كبير')
    .regex(/[a-z]/, 'يجب أن تحتوي كلمة المرور على حرف صغير')
    .regex(/[0-9]/, 'يجب أن تحتوي كلمة المرور على رقم'),
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  phone: z.string().regex(/^\d{11}$/, 'رقم الهاتف يجب أن يكون 11 رقماً').optional().or(z.literal('')),
});

export const companyRegisterSchema = z.object({
  companyName: z.string().min(2, 'اسم الشركة مطلوب'),
  adminName: z.string().min(2, 'اسم المدير مطلوب'),
  email: z.string().email('البريد الإلكتروني غير صحيح'),
  phone: z.string().regex(/^\d{11}$/, 'رقم الهاتف يجب أن يكون 11 رقماً').optional().or(z.literal('')),
  password: z
    .string()
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .regex(/[A-Z]/, 'يجب أن تحتوي كلمة المرور على حرف كبير')
    .regex(/[a-z]/, 'يجب أن تحتوي كلمة المرور على حرف صغير')
    .regex(/[0-9]/, 'يجب أن تحتوي كلمة المرور على رقم'),
  notes: z.string().optional(),
});

export const profileUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().regex(/^\d{11}$/, 'رقم الهاتف يجب أن يكون 11 رقماً').optional().or(z.literal('')),
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .regex(/[A-Z]/, 'يجب أن تحتوي كلمة المرور على حرف كبير')
    .regex(/[a-z]/, 'يجب أن تحتوي كلمة المرور على حرف صغير')
    .regex(/[0-9]/, 'يجب أن تحتوي كلمة المرور على رقم')
    .optional(),
});

export const bookingSchema = z.object({
  tripId: z.string().min(1, 'الرحلة مطلوبة'),
  seatLabel: z.string().min(1, 'المقعد مطلوب'),
  passengerName: z.string().optional().default(''),
  passengerPhone: z.string().optional().default(''),
  passengerHotel: z.string().optional().default(''),
  passengerNotes: z.string().optional().default(''),
  collectAmount: z.number().positive().nullable().optional(),
  fromStationId: z.string().nullable().optional(),
  toStationId: z.string().nullable().optional(),
  holdId: z.string().optional(),
  roundTripGroupId: z.string().optional(),
});

export const companyBookingSchema = z.object({
  tripId: z.string().min(1, 'الرحلة مطلوبة'),
  passengers: z
    .array(
      z.object({
        seatLabel: z.string().min(1, 'المقعد مطلوب'),
        passengerName: z.string().min(1, 'اسم الراكب مطلوب'),
        passengerPhone: z.string().optional().default(''),
        passengerHotel: z.string().optional().default(''),
        passengerNotes: z.string().optional().default(''),
        collectAmount: z.number().positive().nullable().optional(),
      })
    )
    .min(1, 'يجب إضافة راكب واحد على الأقل'),
  fromStationId: z.string().nullable().optional(),
  toStationId: z.string().nullable().optional(),
  customerId: z.string().nullable().optional(),
  bookingType: z.enum(['FOR_CLIENT', 'FOR_EMPLOYEE', 'FOR_GUEST']).optional().default('FOR_EMPLOYEE'),
  roundTripGroupId: z.string().nullable().optional(),
});

export const stationSchema = z.object({
  name: z.string().min(1, 'اسم المحطة مطلوب'),
  city: z.string().min(1, 'المدينة مطلوبة'),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const busSchema = z.object({
  name: z.string().min(1, 'اسم الباص مطلوب'),
  type: z.enum(['MINI_BUS', 'COACH_BUS', 'VIP_BUS', 'DOUBLE_DECKER', 'CHARTER'], { message: 'نوع الباص غير صحيح' }),
  seatCount: z.number().int().nonnegative().optional().default(0),
  companyId: z.string().nullable().optional(),
});

export const tripCreateSchema = z.object({
  busId: z.string().min(1, 'الباص مطلوب'),
  origin: z.string().optional(),
  destination: z.string().optional(),
  departure: z.string().refine((val) => !isNaN(Date.parse(val)), 'تاريخ المغادرة غير صحيح'),
  arrival: z.string().refine((val) => !isNaN(Date.parse(val)), 'تاريخ الوصول غير صحيح'),
  price: z.number().positive('السعر يجب أن يكون أكبر من صفر').optional(),
  busPrice: z.number().nonnegative().optional(),
  stops: z
    .array(
      z.object({
        stationId: z.string().min(1),
        stopOrder: z.number().int().positive(),
        priceFromOrigin: z.number().min(0, 'السعر يجب أن يكون 0 أو أكثر'),
        arrivalTime: z.string().nullable().optional(),
        departureTime: z.string().nullable().optional(),
      })
    )
    .optional(),
});

export const walletDepositSchema = z.object({
  amount: z.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
  description: z.string().optional().default(''),
});

export const creditLimitSchema = z.object({
  creditLimit: z.number().min(0, 'الحد الائتماني يجب أن يكون 0 أو أكثر'),
  reason: z.string().optional().default(''),
});
