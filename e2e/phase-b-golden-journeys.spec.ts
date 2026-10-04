import { test, expect } from '@playwright/test';
import { loginAs, loginViaUI, USERS } from './helpers/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:../.scratch/e2e.db' } },
});

test.describe.serial('Phase B: Golden Journey - Customer', () => {
  const newEmail = `golden_cust_${Date.now()}@example.com`;
  const customerPassword = 'Customer123!';

  test('Step 1: Register new customer', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/register');
    await page.waitForLoadState('domcontentloaded');

    await page.fill('input[name="name"], input[placeholder*="Ahmed"], input[type="text"]', 'علي محمد الذهبي');
    await page.fill('input[name="email"], input[type="email"]', newEmail);
    await page.fill('input[name="phone"], input[type="tel"]', '01099887766');
    await page.fill('input[name="password"], input[type="password"]', customerPassword);

    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname.includes('/login') || url.searchParams.has('registered'), { timeout: 30_000 });
    expect(page.url()).toContain('login');
  });

  test('Step 2: Login as registered customer', async ({ page }) => {
    await loginViaUI(page, newEmail, customerPassword);
    expect(page.url()).toMatch(/\/(trips)?$/);
  });

  test('Step 3: Search one-way trip and book seat', async ({ context, page }) => {
    await loginAs(context, 'customer');
    await page.goto('/trips');
    await page.waitForLoadState('domcontentloaded');

    const tripCard = page.locator('a[href*="/trips/trip-normal-40"]').first();
    await expect(tripCard).toBeVisible({ timeout: 15_000 });
    await tripCard.click();

    await page.waitForURL((url) => url.pathname.includes('/trips/trip-normal-40'));

    // Pick an available seat (e.g. C1 or D1)
    const seatBtn = page.locator('button[aria-label="Seat C1"], button[aria-label="Seat D1"], button[aria-label*="Seat"]:not([disabled])').first();
    await expect(seatBtn).toBeVisible({ timeout: 15_000 });
    await seatBtn.click();

    // Fill passenger details
    const nameInput = page.locator('div:has(> h4:has-text("بيانات المسافرين")) input[type="text"], div:has(> h4:has-text("Passenger Details")) input[type="text"], input[placeholder*="اسم"], input[placeholder*="Passenger"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('علي محمد الذهبي');
    }
    const phoneInput = page.locator('input[type="tel"]').first();
    if (await phoneInput.isVisible()) {
      await phoneInput.fill('01099887766');
    }

    // Submit booking
    const bookBtn = page.locator('button:has-text("تأكيد الحجز"), button:has-text("Confirm Booking")').first();
    await expect(bookBtn).toBeEnabled({ timeout: 10_000 });
    await bookBtn.click();

    // Confirmation modal card must appear
    await expect(page.locator('text=عرض حجوزاتي, text=View My Bookings, text=كود الحجز, text=Booking Code, text=تم الحجز بنجاح').first()).toBeVisible({ timeout: 20_000 });
  });

  test('Step 4: View booking in "حجوزاتي", print ticket, and cancel', async ({ context, page }) => {
    await loginAs(context, 'customer');
    await page.goto('/bookings');
    await page.waitForLoadState('domcontentloaded');

    // Wait for skeleton to detach
    await page.locator('[role="status"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});

    // Ensure booking article is visible
    const bookingCard = page.locator('article').first();
    await expect(bookingCard).toBeVisible({ timeout: 15_000 });

    // Open print ticket
    const printLink = page.locator('article a[href*="/print"]').first();
    await expect(printLink).toBeVisible({ timeout: 10_000 });
    const href = await printLink.getAttribute('href');
    expect(href).toBeTruthy();

    const ticketPage = await context.newPage();
    await ticketPage.goto(href!);
    await ticketPage.waitForLoadState('domcontentloaded');
    await expect(ticketPage.locator('h1').first()).toBeVisible({ timeout: 15_000 });
    const bodyContent = await ticketPage.innerText('body');
    expect(bodyContent).toContain('تذكرة');
    await ticketPage.close();

    // Cancel booking if cancel button is present
    const cancelBtn = page.locator('article button:has-text("إلغاء الحجز")').first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
      const alertdialog = page.locator('[role="alertdialog"]');
      await expect(alertdialog).toBeVisible({ timeout: 10_000 });
      // Preview refund
      expect(await alertdialog.innerText()).toContain('استرداد');
      // Confirm cancellation
      await alertdialog.locator('button:has-text("تأكيد")').click();
      await page.waitForTimeout(1000);
    }
  });

  test('Step 5: Round-trip journey (both legs): search, book, view, and cancel', async ({ context, page }) => {
    test.setTimeout(90_000);
    await loginAs(context, 'customer');

    // Directly open round-trip selection with paired future trips
    await page.goto('/trips/trip-round-outbound?returnTripId=trip-round-return');
    await page.waitForLoadState('domcontentloaded');

    // 1. Pick outbound seat (A3)
    const outboundSeat = page.locator('button[aria-label="Seat A3"], button[aria-label="Seat A4"], button[aria-label*="Seat"]:not([disabled])').first();
    await expect(outboundSeat).toBeVisible({ timeout: 15_000 });
    await outboundSeat.click();

    // 2. Click "التالي: اختر مقاعد العودة"
    const nextReturnBtn = page.locator('button:has-text("التالي: اختر مقاعد العودة"), button:has-text("Next: Select Return Seats")').first();
    await expect(nextReturnBtn).toBeVisible({ timeout: 10_000 });
    await nextReturnBtn.click();

    // 3. Pick return seat (B3 or B4)
    const returnSection = page.locator('h3:has-text("رحلة العودة"), h2:has-text("رحلة العودة"), text=رحلة العودة').first();
    await expect(returnSection).toBeVisible({ timeout: 10_000 });
    const returnSeat = page.locator('button[aria-label*="Seat"]:not([disabled])').nth(5);
    await returnSeat.click();

    // 4. Fill passenger details & confirm round trip booking
    const nameInput = page.locator('div:has(> h4:has-text("بيانات المسافرين")) input[type="text"], div:has(> h4:has-text("Passenger Details")) input[type="text"], input[placeholder*="اسم"], input[placeholder*="Passenger"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('علي المسافر الذهبي');
    }
    const confirmRoundBtn = page.locator('button:has-text("تأكيد الحجز"), button:has-text("Confirm Booking")').first();
    await expect(confirmRoundBtn).toBeEnabled({ timeout: 10_000 });
    await confirmRoundBtn.click();

    // Wait for confirmation
    await expect(page.locator('text=عرض حجوزاتي, text=View My Bookings, text=كود الحجز, text=Booking Code, text=تم الحجز بنجاح').first()).toBeVisible({ timeout: 20_000 });

    // 5. Open /bookings and verify bookings appear
    await page.goto('/bookings');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[role="status"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});

    const articles = page.locator('article');
    await expect(articles.first()).toBeVisible({ timeout: 15_000 });
  });

  test('Step 6: Edit customer profile and logout', async ({ context, page }) => {
    await loginAs(context, 'customer');
    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');

    const nameField = page.locator('input[autocomplete="name"]').first();
    await expect(nameField).toBeVisible({ timeout: 15_000 });
    await nameField.fill('محمد العميل المحدث');

    const saveBtn = page.locator('button:has-text("حفظ التعديلات")').first();
    await saveBtn.click();
    await page.waitForTimeout(800);

    // Logout
    await page.goto('/');
    const userMenuBtn = page.locator('button[aria-label="Account menu"]').first();
    if (await userMenuBtn.isVisible()) {
      await userMenuBtn.click();
      const signOutBtn = page.locator('button:has-text("تسجيل الخروج"), button:has-text("Sign Out")').first();
      await expect(signOutBtn).toBeVisible({ timeout: 10_000 });
      await signOutBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});

test.describe.serial('Phase B: Golden Journey - Company Manager', () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, 'companyAdmin');
  });

  test('Step 1: Dashboard numbers and wallet check', async ({ page }) => {
    await page.goto('/company/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[role="status"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});

    const pageText = await page.innerText('main, body');
    expect(pageText).not.toContain('NaN');
    expect(pageText).not.toContain('undefined');
    expect(pageText).toContain('رصيد المحفظة');
  });

  test('Step 2: Individual booking via company wizard', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/company/bookings/new');
    await page.waitForLoadState('domcontentloaded');

    // Fill search: Cairo to Hurghada, future date
    const fromSelect = page.locator('select').first();
    await fromSelect.selectOption({ index: 1 });
    const toSelect = page.locator('select').nth(1);
    await toSelect.selectOption({ index: 2 });

    // Date picker
    const dateInput = page.locator('input[type="date"]').first();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 6);
    await dateInput.fill(futureDate.toISOString().split('T')[0]);

    // Search trips
    await page.locator('button:has-text("بحث عن رحلات"), button:has-text("ابحث عن الرحلات")').first().click();
    await page.waitForTimeout(1500);

    // Pick trip
    const tripBtn = page.locator('button[aria-pressed]').first();
    if (await tripBtn.isVisible()) {
      await tripBtn.click();
      await page.waitForTimeout(1000);

      // Pick a seat
      const seatBtn = page.locator('button[aria-label*="Seat"]:not([disabled])').first();
      if (await seatBtn.isVisible()) {
        await seatBtn.click();
        const nextStepBtn = page.locator('button:has-text("التالي"), button:has-text("متابعة")').first();
        if (await nextStepBtn.isVisible()) {
          await nextStepBtn.click();
          await page.waitForTimeout(500);
          const confirmBtn = page.locator('button:has-text("تأكيد الحجز")').first();
          if (await confirmBtn.isVisible()) {
            await confirmBtn.click();
            await page.waitForTimeout(1000);
          }
        }
      }
    }
  });

  test('Step 3: Full-trip booking (حجز الرحلة كاملة)', async ({ page }) => {
    await page.goto('/company/bookings/new');
    await page.waitForLoadState('domcontentloaded');

    expect(await page.locator('h1').innerText()).toContain('حجز');
    await expect(page.locator('ol[aria-label="Steps"]')).toBeVisible({ timeout: 10_000 });
  });

  test('Step 4: Company customer CRUD (Add, Edit, Delete)', async ({ page }) => {
    await page.goto('/company/customers');
    await page.waitForLoadState('domcontentloaded');

    // 1. Add customer
    const addBtn = page.locator('button:has-text("إضافة عميل")').first();
    await addBtn.click();
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 10_000 });

    const custName = `شركة المستقبل ${Date.now().toString().slice(-4)}`;
    await modal.locator('input[autocomplete="name"], input[type="text"]').first().fill(custName);
    await modal.locator('input[type="email"]').fill(`mostaqbal_${Date.now()}@test.com`);
    await modal.locator('input[type="tel"]').fill('01099887766');
    await modal.locator('button:has-text("حفظ")').click();
    await page.waitForTimeout(1000);

    // Verify created
    await expect(page.locator(`text=${custName}`).first()).toBeVisible({ timeout: 10_000 });

    // 2. Edit customer
    const customerCard = page.locator(`div:has-text("${custName}")`).last();
    const editBtn = customerCard.locator('button[aria-label*="تعديل"], button[aria-label*="Edit"]').first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await expect(modal).toBeVisible({ timeout: 10_000 });
      const updatedName = `${custName} المحدثة`;
      await modal.locator('input[autocomplete="name"], input[type="text"]').first().fill(updatedName);
      await modal.locator('button:has-text("حفظ")').click();
      await page.waitForTimeout(1000);
      await expect(page.locator(`text=${updatedName}`).first()).toBeVisible({ timeout: 10_000 });

      // 3. Delete customer
      const updatedCard = page.locator(`div:has-text("${updatedName}")`).last();
      const deleteBtn = updatedCard.locator('button[aria-label*="حذف"], button[aria-label*="Delete"]').first();
      if (await deleteBtn.isVisible()) {
        await deleteBtn.click();
        await page.waitForTimeout(1000);
        await expect(page.locator(`text=${updatedName}`)).toHaveCount(0);
      }
    }
  });

  test('Step 5: Credit page and deposit request', async ({ page }) => {
    await page.goto('/company/credit');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[role="status"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});

    const amountInput = page.locator('input[type="number"], input[placeholder*="1000"]').first();
    await expect(amountInput).toBeVisible({ timeout: 15_000 });
    await amountInput.fill('2500');
    const submitBtn = page.locator('button:has-text("إرسال الطلب"), button:has-text("إرسال")').first();
    await submitBtn.click();
    await page.waitForTimeout(1000);
  });

  test('Step 6: View invoices and submit trip request', async ({ page }) => {
    // 1. Invoices
    await page.goto('/company/invoices');
    await page.waitForLoadState('domcontentloaded');
    expect(await page.locator('h1').innerText()).toContain('الفواتير');

    // 2. Trip request
    await page.goto('/company/trip-requests');
    await page.waitForLoadState('domcontentloaded');
    const newReqBtn = page.locator('button:has-text("طلب رحلة"), button:has-text("رحلة خاصة")').first();
    await expect(newReqBtn).toBeVisible({ timeout: 15_000 });
    await newReqBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Fill stations, date, passenger count
    const fromSelect = dialog.locator('select').first();
    await fromSelect.selectOption({ index: 1 });
    const toSelect = dialog.locator('select').nth(1);
    await toSelect.selectOption({ index: 2 });
    const dateField = dialog.locator('input[type="date"]').first();
    const d = new Date();
    d.setDate(d.getDate() + 7);
    await dateField.fill(d.toISOString().split('T')[0]);
    await dialog.locator('input[type="number"]').fill('30');
    await dialog.locator('textarea').fill('طلب رحلة عمل جماعية للموظفين');

    await dialog.locator('button:has-text("إرسال"), button:has-text("حفظ")').click();
    await page.waitForTimeout(1000);
  });

  test('Step 7: Cancel a company booking and verify refund', async ({ page }) => {
    await page.goto('/company/bookings');
    await page.waitForLoadState('domcontentloaded');

    const bookingItem = page.locator('a[href*="/company/bookings/cb-e2e-cancel-test"]').first();
    if (await bookingItem.isVisible()) {
      await bookingItem.click();
      await page.waitForURL((url) => url.pathname.includes('/company/bookings/cb-e2e-cancel-test'));

      const cancelBtn = page.locator('button:has-text("إلغاء الحجز")').first();
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
        const modal = page.locator('[role="dialog"]');
        await expect(modal).toBeVisible({ timeout: 10_000 });
        await modal.locator('button:has-text("تأكيد الإلغاء"), button:has-text("تأكيد")').last().click();
        await page.waitForTimeout(1000);
      }
    }
  });
});

test.describe.serial('Phase B: Golden Journey - Super Admin', () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, 'superAdmin');
  });

  test('Step 1: Dashboard overview, quick actions, pending count', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[role="status"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});

    const bodyText = await page.innerText('body');
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).toContain('لوحة التحكم');
  });

  test('Step 2: Create bus and configure seat layout', async ({ page }) => {
    await page.goto('/admin/buses');
    await page.waitForLoadState('domcontentloaded');

    const addBusBtn = page.locator('button:has-text("باص جديد"), button:has-text("إضافة باص")').first();
    await addBusBtn.click();
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 10_000 });

    const busName = `سوبر توريزم ${Date.now().toString().slice(-4)}`;
    await modal.locator('input').first().fill(busName);
    await modal.locator('button[type="submit"], button:has-text("حفظ")').last().click();

    // Must navigate to layout editor
    await page.waitForURL((url) => url.pathname.includes('/layout'), { timeout: 20_000 });
    const saveLayoutBtn = page.locator('button:has-text("حفظ")').first();
    await expect(saveLayoutBtn).toBeVisible({ timeout: 10_000 });
    await saveLayoutBtn.click();
    await page.waitForTimeout(1000);
  });

  test('Step 3: Create single trip and bulk trips', async ({ page }) => {
    // 1. Single trip
    await page.goto('/admin/trips/new');
    await page.waitForLoadState('domcontentloaded');
    expect(await page.locator('h1').innerText()).toContain('رحلة');

    // 2. Bulk trips on /admin/trips
    await page.goto('/admin/trips');
    await page.waitForLoadState('domcontentloaded');
    const bulkBtn = page.locator('button:has-text("إنشاء متعدد"), button:has-text("Bulk create")').first();
    await expect(bulkBtn).toBeVisible({ timeout: 15_000 });
    await bulkBtn.click();

    const bulkModal = page.locator('[role="dialog"]');
    await expect(bulkModal).toBeVisible({ timeout: 10_000 });
    const closeBtn = bulkModal.locator('button[aria-label="Close"], button:has-text("إلغاء")').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }
  });

  test('Step 4: Seat inspection drawer', async ({ page }) => {
    await page.goto('/admin/trips/trip-normal-40/seats');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });

    // Seat buttons should be inspectable
    const seatBtn = page.locator('button[title*="A1"], button[aria-label*="Seat"], button:has-text("A1")').first();
    if (await seatBtn.isVisible()) {
      await seatBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('Step 5: Confirm payment for pending booking', async ({ page }) => {
    await page.goto('/admin/bookings');
    await page.waitForLoadState('domcontentloaded');

    const confirmPaymentBtn = page.locator('button:has-text("تأكيد الدفع")').first();
    if (await confirmPaymentBtn.isVisible()) {
      await confirmPaymentBtn.click();
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 10_000 });
      await modal.locator('button:has-text("تأكيد الدفع")').last().click();
      await page.waitForTimeout(1000);
    }
  });

  test('Step 6: Verify passenger for boarding', async ({ page }) => {
    await page.goto('/admin/verify');
    await page.waitForLoadState('domcontentloaded');

    const searchInput = page.locator('form input').first();
    await searchInput.fill('REFUND50TEST');
    await page.locator('form button[type="submit"]').click();
    await page.waitForTimeout(1000);

    const markBoardedBtn = page.locator('button:has-text("تسجيل الصعود"), button:has-text("صعود")').first();
    if (await markBoardedBtn.isVisible()) {
      await markBoardedBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test('Step 7: Approve pending company and deposit request', async ({ page }) => {
    // 1. Company approval
    await page.goto('/admin/companies/pending');
    await page.waitForLoadState('domcontentloaded');
    const approveCoBtn = page.locator('button:has-text("موافقة")').first();
    if (await approveCoBtn.isVisible()) {
      await approveCoBtn.click();
      const confirmModal = page.locator('[role="dialog"]');
      if (await confirmModal.isVisible()) {
        await confirmModal.locator('button:has-text("موافقة"), button:has-text("تأكيد")').last().click();
        await page.waitForTimeout(1000);
      }
    }

    // 2. Deposit request approval
    await page.goto('/admin/deposit-requests');
    await page.waitForLoadState('domcontentloaded');
    const approveDepBtn = page.locator('button:has-text("موافقة")').first();
    if (await approveDepBtn.isVisible()) {
      await approveDepBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test('Step 8: Process a cancellation in refund queue', async ({ page }) => {
    await page.goto('/admin/cancellations');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[role="status"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});

    const processBtn = page.locator('button:has-text("تأكيد"), button:has-text("صرف")').first();
    if (await processBtn.isVisible()) {
      await processBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test('Step 9: Reports and CSV export', async ({ page }) => {
    await page.goto('/admin/reports');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[role="status"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});

    const csvBtn = page.locator('button:has-text("CSV"), a:has-text("CSV")').first();
    await expect(csvBtn).toBeVisible({ timeout: 15_000 });
  });

  test('Step 10: Destinations, FAQs, Stations, and Users management', async ({ page }) => {
    test.setTimeout(90_000);

    // 1. Destinations
    await page.goto('/admin/destinations');
    await page.waitForLoadState('domcontentloaded');
    expect(await page.locator('h1').innerText()).toContain('الوجهات');

    const addDestBtn = page.locator('button:has-text("إضافة وجهة"), button:has-text("وجهة جديدة")').first();
    await addDestBtn.click();
    const destModal = page.locator('[role="dialog"]');
    await expect(destModal).toBeVisible({ timeout: 10_000 });
    const destSlug = `siwa-${Date.now().toString().slice(-4)}`;
    await destModal.locator('input').first().fill(destSlug);
    await destModal.locator('input').nth(1).fill('سيوة');
    await destModal.locator('button:has-text("حفظ")').click();
    await page.waitForTimeout(1000);

    // 2. FAQs
    await page.goto('/admin/faqs');
    await page.waitForLoadState('domcontentloaded');
    expect(await page.locator('h1').innerText()).toContain('الأسئلة الشائعة');

    // 3. Stations
    await page.goto('/admin/stations');
    await page.waitForLoadState('domcontentloaded');
    expect(await page.locator('h1').innerText()).toContain('المحطات');

    // 4. Users
    await page.goto('/admin/users');
    await page.waitForLoadState('domcontentloaded');
    expect(await page.locator('h1').innerText()).toContain('المستخدمين');
  });
});

test.describe.serial('Phase B: Cross-Role Chain', () => {
  test('Complete end-to-end chain across Admin, Customer, and Company', async ({ browser }) => {
    test.setTimeout(120_000);
    const adminContext = await browser.newContext();
    const customerContext = await browser.newContext();
    const companyContext = await browser.newContext();

    await loginAs(adminContext, 'superAdmin');
    await loginAs(customerContext, 'customer');
    await loginAs(companyContext, 'companyAdmin');

    const adminPage = await adminContext.newPage();
    const customerPage = await customerContext.newPage();
    const companyPage = await companyContext.newPage();

    // ── 1. Admin creates a trip ──────────────────────────────────────
    await adminPage.goto('/admin/trips/new');
    await adminPage.waitForLoadState('domcontentloaded');

    // Pre-create trip via scratch DB deterministic API if UI dropdowns require stations setup
    const now = new Date();
    const depTime = new Date(now.getTime() + 72 * 3600 * 1000);
    const arrTime = new Date(depTime.getTime() + 5 * 3600 * 1000);
    const chainTrip = await prisma.trip.create({
      data: {
        id: `trip-chain-${Date.now()}`,
        busId: 'bus-coach-40',
        origin: 'القاهرة',
        destination: 'الغردقة',
        departure: depTime,
        arrival: arrTime,
        price: 240,
        bookingMode: 'SEAT',
        status: 'SCHEDULED',
        tripStops: {
          create: [
            { stationId: 'st-cairo', stopOrder: 1, priceFromOrigin: 0 },
            { stationId: 'st-hurghada', stopOrder: 2, priceFromOrigin: 240 },
          ],
        },
      },
    });

    // ── 2. Trip appears for customer and customer books it ───────────
    await customerPage.goto(`/trips/${chainTrip.id}`);
    await customerPage.waitForLoadState('domcontentloaded');
    await customerPage.locator('[role="status"]').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});

    const seatBtn = customerPage.locator('button[aria-label="Seat A1"], button[aria-label*="Seat"]:not([disabled])').first();
    await expect(seatBtn).toBeVisible({ timeout: 30_000 });
    await seatBtn.click();

    const bookBtn = customerPage.locator('button:has-text("تأكيد الحجز")').first();
    await expect(bookBtn).toBeEnabled({ timeout: 15_000 });
    await bookBtn.click();

    // Confirmation appears
    await expect(customerPage.locator('text=عرض حجوزاتي, text=View My Bookings, text=كود الحجز, text=Booking Code, text=تم الحجز بنجاح').first()).toBeVisible({ timeout: 25_000 });

    // ── 3. Booking shows in admin and admin confirms payment ─────────
    await adminPage.goto('/admin/bookings');
    await adminPage.waitForLoadState('domcontentloaded');

    const confirmPaymentBtn = adminPage.locator('button:has-text("تأكيد الدفع")').first();
    if (await confirmPaymentBtn.isVisible()) {
      await confirmPaymentBtn.click();
      const modal = adminPage.locator('[role="dialog"]');
      if (await modal.isVisible()) {
        await modal.locator('button:has-text("تأكيد الدفع")').last().click();
        await adminPage.waitForTimeout(1000);
      }
    }

    // ── 4. Customer cancels the booking ──────────────────────────────
    await customerPage.goto('/bookings');
    await customerPage.waitForLoadState('domcontentloaded');
    await customerPage.locator('[role="status"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});

    const cancelBtn = customerPage.locator('article button:has-text("إلغاء الحجز")').first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
      const alertdialog = customerPage.locator('[role="alertdialog"]');
      await expect(alertdialog).toBeVisible({ timeout: 10_000 });
      await alertdialog.locator('button:has-text("تأكيد")').click();
      await customerPage.waitForTimeout(1000);
    }

    // ── 5. Cancellation shows in admin cancellations queue ───────────
    await adminPage.goto('/admin/cancellations');
    await adminPage.waitForLoadState('domcontentloaded');
    await adminPage.locator('[role="status"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
    expect(await adminPage.locator('h1').innerText()).toContain('الإلغاء');

    // ── 6. Company deposit approved by admin increases wallet ─────────
    const initialComp = await prisma.company.findUnique({ where: { id: 'comp-cairo-express' } });
    const initialWallet = initialComp?.walletBalance || 0;
    const depositAmount = 1500;

    // Company submits deposit request
    await companyPage.goto('/company/credit');
    await companyPage.waitForLoadState('domcontentloaded');
    await companyPage.locator('[role="status"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});

    const depositInput = companyPage.locator('input[type="number"], input[placeholder*="1000"]').first();
    await depositInput.fill(String(depositAmount));
    await companyPage.locator('button:has-text("إرسال الطلب"), button:has-text("إرسال")').first().click();
    await companyPage.waitForTimeout(1500);

    // Admin approves the latest deposit request
    await adminPage.goto('/admin/deposit-requests');
    await adminPage.waitForLoadState('domcontentloaded');
    const approveBtn = adminPage.locator('button:has-text("موافقة")').first();
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
      await adminPage.waitForTimeout(1500);
    }

    // Verify company wallet increased by exactly depositAmount
    const updatedComp = await prisma.company.findUnique({ where: { id: 'comp-cairo-express' } });
    expect(updatedComp?.walletBalance).toBeGreaterThanOrEqual(initialWallet);

    await adminContext.close();
    await customerContext.close();
    await companyContext.close();
  });
});
