# Comprehensive Testing Guide - CrushCar P2P System

## تم إصلاح مشكلة الـ Login ✅

**المشكلة:** الـ `signIn` callback في NextAuth v5 كان بيرجع URLs، وده بيكسر الـ authentication flow.
**الحل:** الـ callback دلوقتي بيرجع `true` فقط، والـ redirect بيتم في الـ login page بعد ما الـ session تتعمل.

---

## طريقة تشغيل التطبيق

```bash
# 1. تأكد إن قاعدة البيانات موجودة
npm run db:seed

# 2. شغل الـ dev server
npm run dev

# 3. افتح المتصفح على
http://localhost:3000
```

---

## الحسابات المتاحة للاختبار

| الدور | الإيميل | الباسورد | الوصول |
|---|---|---|---|
| **SUPER_ADMIN** | `superadmin@crushcar.com` | `super123` | `/admin/*` فقط |
| **COMPANY_ADMIN** (بأتابيصات) | `admin@cairoexpress.com` | `admin123` | `/admin/*` (عنده buses) |
| **CUSTOMER** | `user@example.com` | `user123` | `/trips` + `/bookings` |

---

## Test Suite 1: SUPER_ADMIN Testing

### 1.1 Login Test
- [ ] افتح `http://localhost:3000/login`
- [ ] اضغط على زر "سوبر أدمن" (الأحمر)
- [ ] اضغط Sign In
- [ ] **المتوقع:** يتredirect لـ `/admin` مباشرة

### 1.2 Dashboard Access
- [ ] يشوف `/admin` dashboard
- [ ] **المتوقع:** يشوف كل الإحصائيات (Total Bookings, Total Revenue, Active Trips, Today's Revenue)

### 1.3 Companies Pending
- [ ] يروح لـ `/admin/companies/pending`
- [ ] **المتوقع:** يشوف الشركات المعلقة (لو فيه)

### 1.4 Credit Report
- [ ] يروح لـ `/admin/credit-report`
- [ ] **المتوقع:** يشوف تقرير الكريدت لكل الشركات

### 1.5 User Management
- [ ] يروح لـ `/admin/users`
- [ ] يضغط "Add User"
- [ ] يختار role: Super Admin
- [ ] **المتوقع:** يتم الإنشاء بنجاح

### 1.6 Protection Tests
- [ ] يحاول يدخل `/company/dashboard`
- [ ] **المتوقع:** يتredirect لـ `/admin`
- [ ] يحاول يدخل `/company/bookings`
- [ ] **المتوقع:** يتredirect لـ `/admin`
- [ ] يحاول يدخل `/trips`
- [ ] **المتوقع:** يتredirect لـ `/admin`

### 1.7 Profile Test
- [ ] يضغط على "حسابي" أو يروح لـ `/profile`
- [ ] **المتوقع:** يشوف البروفايل بتاعه (مش login page)

---

## Test Suite 2: COMPANY_ADMIN (بأتابيصات) Testing

### 2.1 Login Test
- [ ] افتح `http://localhost:3000/login`
- [ ] اضغط على زر "أدمن" (الأزرق)
- [ ] اضغط Sign In
- [ ] **المتوقع:** يتredirect لـ `/admin` (عنده buses)

### 2.2 Dashboard Access
- [ ] يشوف `/admin` dashboard
- [ ] **المتوقع:** يشوف إحصائيات شركته بس

### 2.3 Buses Management
- [ ] يروح لـ `/admin/buses`
- [ ] **المتوقع:** يشوف باصاته بس (Coach 01, VIP 01, Mini 01)

### 2.4 Trips Management
- [ ] يروح لـ `/admin/trips`
- [ ] **المتوقع:** يشوف رحلاته بس

### 2.5 Protection Tests
- [ ] يحاول يدخل `/admin/companies/pending`
- [ ] **المتوقع:** يتredirect لـ `/admin` (موالوش صلاحية)
- [ ] يحاول يدخل `/admin/credit-report`
- [ ] **المتوقع:** يتredirect لـ `/admin` (موالوش صلاحية)
- [ ] يحاول يدخل `/company/dashboard`
- [ ] **المتوقع:** يتredirect لـ `/admin`
- [ ] يحاول يدخل `/company/bookings`
- [ ] **المتوقع:** يتredirect لـ `/admin`

### 2.6 Profile Test
- [ ] يضغط على "حسابي" أو يروح لـ `/profile`
- [ ] **المتوقع:** يشوف البروفايل بتاعه (مش login page)

---

## Test Suite 3: P2P Company Testing

### 3.1 Company Registration
- [ ] افتح `http://localhost:3000/register/company`
- [ ] املى الفورم:
  - Company Name: `Test P2P Company`
  - Admin Name: `Test Admin`
  - Email: `testp2p@example.com`
  - Password: `test123`
- [ ] اضغط Register Company
- [ ] **المتوقع:** يظهر رسالة "تم التسجيل بنجاح"

### 3.2 Admin Approval
- [ ] سجل دخول بـ `superadmin@crushcar.com` / `super123`
- [ ] روح لـ `/admin/companies/pending`
- [ ] **المتوقع:** تشوف الشركة الجديدة "Test P2P Company"
- [ ] اضغط Approve
- [ ] حدد Credit Limit: `10000`
- [ ] اختار Payment Mode: `PREPAID`
- [ ] اختار Billing Cycle: `MONTHLY`
- [ ] اضغط Activate
- [ ] **المتوقع:** يتم التفعيل بنجاح

### 3.3 P2P Company Login
- [ ] سجل خروج
- [ ] سجل دخول بـ `testp2p@example.com` / `test123`
- [ ] **المتوقع:** يتredirect لـ `/company/dashboard`

### 3.4 Company Dashboard
- [ ] يشوف `/company/dashboard`
- [ ] **المتوقع:** يشوف داشبورد الشركة (Wallet Balance, Available Credit, Outstanding, Total Bookings)

### 3.5 Bookings
- [ ] يروح لـ `/company/bookings`
- [ ] **المتوقع:** يشوف حجوزاته (فاضية في الأول)
- [ ] يروح لـ `/company/bookings/new`
- [ ] يختار رحلة ويحجز
- [ ] **المتوقع:** يتم الحجز بنجاح

### 3.6 Customers Management
- [ ] يروح لـ `/company/customers`
- [ ] يضيف عميل جديد
- [ ] **المتوقع:** يتم الإضافة بنجاح

### 3.7 Credit & Wallet
- [ ] يروح لـ `/company/credit`
- [ ] **المتوقع:** يشوف الكريدت والمحفظة
- [ ] يشحن رصيد (Deposit)
- [ ] **المتوقع:** يتم الشحن بنجاح

### 3.8 Invoices
- [ ] يروح لـ `/company/invoices`
- [ ] **المتوقع:** يشوف الفواتير (لو فيه)

### 3.9 Protection Tests
- [ ] يحاول يدخل `/admin`
- [ ] **المتوقع:** يتredirect لـ `/company/dashboard`
- [ ] يحاول يدخل `/admin/companies/pending`
- [ ] **المتوقع:** يتredirect لـ `/company/dashboard`
- [ ] يحاول يدخل `/trips`
- [ ] **المتوقع:** يتredirect لـ `/company/dashboard`

### 3.10 Profile Test
- [ ] يضغط على "حسابي" أو يروح لـ `/profile`
- [ ] **المتوقع:** يشوف البروفايل بتاعه (مش login page)

---

## Test Suite 4: CUSTOMER Testing

### 4.1 Login Test
- [ ] افتح `http://localhost:3000/login`
- [ ] اضغط على زر "يوزر" (الأخضر)
- [ ] اضغط Sign In
- [ ] **المتوقع:** يتredirect لـ `/trips`

### 4.2 Trips Access
- [ ] يشوف `/trips`
- [ ] **المتوقع:** يشوف الرحلات المتاحة

### 4.3 Booking Test
- [ ] يختار رحلة ويحجز
- [ ] **المتوقع:** يتم الحجز بنجاح

### 4.4 Bookings Access
- [ ] يروح لـ `/bookings`
- [ ] **المتوقع:** يشوف حجوزاته بس

### 4.5 Protection Tests
- [ ] يحاول يدخل `/admin`
- [ ] **المتوقع:** يتredirect لـ `/trips`
- [ ] يحاول يدخل `/company/dashboard`
- [ ] **المتوقع:** يتredirect لـ `/trips`

### 4.6 Profile Test
- [ ] يضغط على "حسابي" أو يروح لـ `/profile`
- [ ] **المتوقع:** يشوف البروفايل بتاعه (مش login page)

---

## Test Suite 5: Security & Edge Cases

### 5.1 Direct URL Access
- [ ] افتح `http://localhost:3000/admin` من غير login
- [ ] **المتوقع:** يتredirect لـ `/login`
- [ ] افتح `http://localhost:3000/company/dashboard` من غير login
- [ ] **المتوقع:** يتredirect لـ `/login`

### 5.2 Cross-Role Access
- [ ] سجل دخول بـ CUSTOMER
- [ ] حاول يدخل `/admin`
- [ ] **المتوقع:** يتredirect لـ `/trips`
- [ ] سجل دخول بـ SUPER_ADMIN
- [ ] حاول يدخل `/company/dashboard`
- [ ] **المتوقع:** يتredirect لـ `/admin`
- [ ] سجل دخول بـ COMPANY_ADMIN (بأتابيصات)
- [ ] حاول يدخل `/company/dashboard`
- [ ] **المتوقع:** يتredirect لـ `/admin`
- [ ] سجل دخول بـ P2P Company
- [ ] حاول يدخل `/admin`
- [ ] **المتوقع:** يتredirect لـ `/company/dashboard`

### 5.3 API Protection
- [ ] جرب API `/api/admin/companies/pending` بـ CUSTOMER role
- [ ] **المتوقع:** يرجع 401/403
- [ ] جرب API `/api/admin/credit-report` بـ COMPANY_ADMIN
- [ ] **المتوقع:** يرجع 401/403
- [ ] جرب API `/api/company/bookings` بـ CUSTOMER
- [ ] **المتوقع:** يرجع 401/403

### 5.4 Sign Out
- [ ] سجل خروج من أي role
- [ ] **المتوقع:** يروح لـ `/login`
- [ ] حاول ترجع لـ `/admin` أو `/company/dashboard`
- [ ] **المتوقع:** يتredirect لـ `/login`

### 5.5 Invalid Credentials
- [ ] حاول تدخل بـ إيميل غلط
- [ ] **المتوقع:** يظهر error message "Invalid credentials"
- [ ] حاول تدخل بـ باسورد غلط
- [ ] **المتوقع:** يظهر error message "Invalid credentials"

---

## ملخص النتائج المتوقعة

| الدور | Login Redirect | Admin Access | Company Access | Trips Access |
|---|---|---|---|---|
| **SUPER_ADMIN** | `/admin` | ✅ Full | ❌ Redirect to /admin | ❌ Redirect to /admin |
| **COMPANY_ADMIN** (بأتابيصات) | `/admin` | ✅ Company only | ❌ Redirect to /admin | ❌ Redirect to /admin |
| **COMPANY_ADMIN** (P2P) | `/company/dashboard` | ❌ Redirect to /company | ✅ Full | ❌ Redirect to /company |
| **CUSTOMER** | `/trips` | ❌ Redirect to /trips | ❌ Redirect to /trips | ✅ Full |

---

## ملاحظات مهمة

1. **الـ SUPER_ADMIN ميدخلش `/company/*`** - ده dashboard خاص بـ P2P companies فقط
2. **الـ COMPANY_ADMIN بأتابيصات ميدخلش `/company/*`** - هو بس بيقدم رحلات مش بيحجز
3. **الـ P2P Company ميدخلش `/admin/*`** - هو بيحجز مش بيقدم رحلات
4. **الـ CUSTOMER ميدخلش لا `/admin/*` ولا `/company/*`** - هو بس بيحجز لنفسه

---

## لو فيه مشكلة

1. **الـ login مش بيشتغل:**
   - شوف الـ console في المتصفح لو فيه errors
   - تأكد إن الـ dev server شغال (`npm run dev`)
   - جرب clear cookies والـ cache

2. **الـ redirect مش بيشتغل صح:**
   - تأكد إن الـ session بتتعمل بعد الـ login
   - شوف الـ network tab في المتصفح

3. **الـ API بيرجع 401/403:**
   - تأكد إنك مسجل دخول بالدور الصح
   - شوف الـ session في `/api/auth/session`

---

## تاريخ الإنشاء
2026-05-18

## النسخة
1.0.0
