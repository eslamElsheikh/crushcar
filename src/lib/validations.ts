import { z } from 'zod';
import { BUS_TYPE_VALUES } from './bus-types';

/** One password policy, shared by self-registration and admin resets. */
export const passwordSchema = z
  .string()
  .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
  .regex(/[A-Z]/, 'يجب أن تحتوي كلمة المرور على حرف كبير')
  .regex(/[a-z]/, 'يجب أن تحتوي كلمة المرور على حرف صغير')
  .regex(/[0-9]/, 'يجب أن تحتوي كلمة المرور على رقم');

export const registerSchema = z.object({
  email: z.string().email('البريد الإلكتروني غير صحيح'),
  password: passwordSchema,
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

/**
 * Ceiling on a collected amount, in EGP. Generous enough for any real
 * corporate collection, low enough that a pasted phone number or a stray
 * extra zero cannot land in the ledger.
 */
export const COLLECT_AMOUNT_MAX = 1_000_000;

/**
 * The ceiling already enforced, elsewhere in this codebase, on a single
 * movement of money: the platform funding endpoint refuses anything above
 * 100,000,000 piastres, which is this figure in pounds. It is applied here
 * so a deposit or a wallet credit cannot be a different order of magnitude
 * from a platform top-up for no reason anyone wrote down.
 *
 * This is *not* a business policy decision — it is the existing one,
 * restated. If the operator wants a larger ceiling for deposits or credits,
 * change this one number; nothing else needs to move.
 */
export const MONEY_AMOUNT_MAX = 1_000_000;

export type MoneyParse =
  | { ok: true; value: number }
  | { ok: false; reason: string };

/**
 * The rule for one amount of money arriving from a request body.
 *
 * The checks that matter, in order:
 *
 *   - it has to be a *number*. `!amount || amount <= 0` accepted the string
 *     `"100"` (a non-empty string is truthy, and `"100" <= 0` is false) and
 *     handed it to the database as a number; `"abc"` sailed through the same
 *     test and was only caught by the driver throwing.
 *   - it has to be finite: JSON `1e309` parses to `Infinity`, which is
 *     greater than zero and is not an amount.
 *   - it has to be positive, above a floor that survives rounding — an
 *     amount of `0.001` rounds to nothing and would record a movement of
 *     zero.
 *   - it has to be within the ceiling above.
 *   - it has to be an amount of money: two decimal places, no more. A value
 *     that is not exactly representable as cents is refused rather than
 *     silently rounded, because quietly changing what someone typed is how
 *     a ledger starts disagreeing with a bank statement.
 */
export function parseMoneyAmount(
  raw: unknown,
  opts: { min?: number; max?: number; allowNegative?: boolean } = {}
): MoneyParse {
  const min = opts.min ?? 0.01;
  const max = opts.max ?? MONEY_AMOUNT_MAX;

  if (typeof raw !== 'number') return { ok: false, reason: 'Amount must be a number' };
  if (!Number.isFinite(raw)) return { ok: false, reason: 'Amount must be a finite number' };

  const rounded = Math.round(raw * 100) / 100;
  if (rounded !== raw) {
    return { ok: false, reason: 'Amount may have at most two decimal places' };
  }

  const magnitude = Math.abs(rounded);
  if (opts.allowNegative) {
    if (magnitude === 0) return { ok: false, reason: 'Amount must not be zero' };
  } else if (rounded < min) {
    return { ok: false, reason: `Amount must be at least ${min}` };
  }

  if (magnitude > max) return { ok: false, reason: `Amount must not exceed ${max}` };

  return { ok: true, value: rounded };
}

/**
 * Coerces whatever the booking form sent into a stored collectAmount.
 *
 * Both the single-seat path (trips/[id]) and the bulk path
 * (company/bookings/new) feed this, and both used to invent their own rule:
 * one read `.toString()` and passed NaN straight through, the other trusted
 * the number as typed. An unusable value becomes null — "not collected" — so
 * the ticket and the admin column render their empty state instead of NaN.
 */
export function parseCollectAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0 || n > COLLECT_AMOUNT_MAX) return null;
  // Two decimals is a currency amount; anything finer is a typo.
  return Math.round(n * 100) / 100;
}

/**
 * Divides a collected amount across the seats a booking covers.
 *
 * The booking wizard takes one collection figure for the whole booking, so it
 * has to be shared out or every seat would store the full amount and four
 * seats booked for 4000 would read as 16000 collected.
 *
 * The shares are whole numbers, because the operator types a round figure and
 * the remainder is a rounding artefact, not money. The leftover goes to the
 * last seats, so 100 over 3 seats is 33 / 33 / 34 and never 33 / 34 / 33 with
 * a missing piastre somewhere. The shares always add back up to `total`
 * exactly — a ledger that silently loses or invents a pound is worse than an
 * ugly split.
 *
 * A seat that works out to zero is stored as null rather than 0, matching
 * parseCollectAmount: nothing was collected for it.
 *
 * A null or unusable total means nothing was entered, so no seat gets a value.
 */
export function splitCollectAmount(total: unknown, seatCount: number): (number | null)[] {
  const clean = parseCollectAmount(total);
  if (clean === null || seatCount <= 0) return Array.from({ length: Math.max(0, seatCount) }, () => null);

  const base = Math.floor(clean / seatCount);
  const remainder = Math.round(clean - base * seatCount);

  return Array.from({ length: seatCount }, (_, i) => {
    const share = base + (i >= seatCount - remainder ? 1 : 0);
    return share > 0 ? share : null;
  });
}

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
  type: z.enum(BUS_TYPE_VALUES as [string, ...string[]], { message: 'نوع الباص غير صحيح' }),
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
  companyPrice: z.number().nonnegative('سعر الشركات يجب أن يكون 0 أو أكثر').nullable().optional(),
  busPrice: z.number().nonnegative().optional(),
  stops: z
    .array(
      z.object({
        stationId: z.string().min(1),
        stopOrder: z.number().int().positive(),
        priceFromOrigin: z.number().min(0, 'السعر يجب أن يكون 0 أو أكثر'),
        companyPriceFromOrigin: z.number().min(0, 'سعر الشركات يجب أن يكون 0 أو أكثر').nullable().optional(),
        arrivalTime: z.string().nullable().optional(),
        departureTime: z.string().nullable().optional(),
      })
    )
    .optional(),
});

export const walletDepositSchema = z.object({
  amount: z.number().finite().positive('المبلغ يجب أن يكون أكبر من صفر'),
  description: z.string().optional().default(''),
});

export const creditLimitSchema = z.object({
  // `.finite()` is validation, not policy: JSON `1e309` arrives as Infinity,
  // which passes `.min(0)` and is not a number a ledger can hold. What a
  // limit may *be* is a business decision and is deliberately not capped
  // here — see SECURITY_VERIFICATION_REPORT.md for the options.
  creditLimit: z
    .number()
    .finite('الحد الائتماني يجب أن يكون رقماً')
    .min(0, 'الحد الائتماني يجب أن يكون 0 أو أكثر'),
  reason: z.string().optional().default(''),
});

/**
 * The rule for one credit limit value.
 *
 * The same rule as creditLimitSchema, on its own, so a route that sets the
 * limit among other fields — the company settings page, or the approval of a
 * pending company — can apply it without having to parse a whole body
 * against the object schema.
 *
 * A credit limit is the ceiling on what a company may owe. A negative one is
 * not a smaller allowance, it is a statement that the company already owes
 * more than it may owe, and the arithmetic that reads it treats the ceiling as
 * lower than the exposure. It is refused rather than stored.
 */
export const creditLimitValueSchema = z
  .number({ error: 'الحد الائتماني يجب أن يكون رقماً' })
  .finite('الحد الائتماني يجب أن يكون رقماً')
  .min(0, 'الحد الائتماني يجب أن يكون 0 أو أكثر');
