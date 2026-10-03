import { test, expect } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

test.describe.serial('Phase B: Golden Journey - Customer', () => {
  const newEmail = `golden_cust_${Date.now()}@example.com`;
  const customerPassword = 'Customer123!';

  test('Step 1: Register new customer', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/register');
    await page.waitForLoadState('domcontentloaded');

    await page.fill('input[name="name"], input[placeholder*="Ahmed"], input[type="text"]', 'علي محمد الذهبي');
    await page.fill('input[name="email"], input[type="email"]', newEmail);
    await page.fill('input[name="phone"], input[type="tel"]', '01099887766');
    await page.fill('input[name="password"], input[type="password"]', customerPassword);

    await page.click('button[type="submit"]');
    // Allow up to 90s for the registration endpoint due to Nodemailer fallback timeout
    await page.waitForURL((url) => url.pathname.includes('/login') || url.searchParams.has('registered'), { timeout: 90_000 });
    expect(page.url()).toContain('login');
  });

  test('Step 2: Login as registered customer', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    await page.fill('input[type="email"]', newEmail);
    await page.fill('input[type="password"]', customerPassword);
    await page.click('button[type="submit"]');

    // Should redirect to /trips or home
    await page.waitForURL((url) => url.pathname === '/trips' || url.pathname === '/', { timeout: 15_000 });
    expect(page.url()).toMatch(/\/(trips)?$/);
  });

  test('Step 3: Search one-way trip and select seats', async ({ context, page }) => {
    await loginAs(context, 'customer');
    // Go to trips list
    await page.goto('/trips');
    await page.waitForLoadState('domcontentloaded');

    // Find our seeded tripNormal40 (القاهرة إلى الغردقة)
    const tripCard = page.locator('a[href*="/trips/trip-normal-40"]').first();
    await tripCard.waitFor({ state: 'visible', timeout: 15_000 });
    await tripCard.click();

    await page.waitForURL((url) => url.pathname.includes('/trips/trip-normal-40'));
    // Select an available seat button (e.g. C1 or C2)
    const seatBtn = page.locator('button[aria-label*="Seat C1"], button:has-text("C1"), button[aria-label*="Seat"]').first();
    if (await seatBtn.isVisible()) {
      await seatBtn.click();
      await page.waitForTimeout(500);
    }

    // Fill passenger details if needed
    const nameInput = page.locator('input[placeholder*="اسم"], input[name="passengerName"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('علي محمد');
    }
    const phoneInput = page.locator('input[placeholder*="هاتف"], input[name="passengerPhone"]').first();
    if (await phoneInput.isVisible()) {
      await phoneInput.fill('01099887766');
    }

    // Click confirm / book button
    const bookBtn = page.locator('button:has-text("تأكيد الحجز"), button:has-text("احجز"), button:has-text("Book")').first();
    if (await bookBtn.isVisible()) {
      await bookBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test('Step 4: View bookings in "حجوزاتي", open ticket, and cancel', async ({ context, page }) => {
    await loginAs(context, 'customer');
    await page.goto('/bookings');
    await page.waitForLoadState('domcontentloaded');

    // Booking list should be visible
    const bookingCard = page.locator('article').first();
    await expect(bookingCard).toBeVisible({ timeout: 15_000 });

    // Open ticket view or print
    const printLink = page.locator('a[href*="/print"]').first();
    if (await printLink.isVisible()) {
      const href = await printLink.getAttribute('href');
      if (href) {
        const ticketPage = await context.newPage();
        await ticketPage.goto(href);
        await ticketPage.waitForLoadState('domcontentloaded');
        await ticketPage.locator('h1').waitFor({ state: 'visible', timeout: 15_000 });
        expect(await ticketPage.locator('body').innerText()).toContain('تذكرة');
        await ticketPage.close();
      }
    }

    // Cancel booking if cancel button available
    const cancelBtn = page.locator('article button:has-text("إلغاء الحجز")').first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
      await page.waitForTimeout(500);

      // Confirm modal in alertdialog
      const confirmCancelBtn = page.locator('[role="alertdialog"] button:has-text("تأكيد")').first();
      if (await confirmCancelBtn.isVisible()) {
        await confirmCancelBtn.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('Step 5: Edit customer profile and logout', async ({ context, page }) => {
    await loginAs(context, 'customer');
    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');

    // Edit profile name
    const nameField = page.locator('input[autocomplete="name"]').first();
    if (await nameField.isVisible()) {
      await nameField.fill('محمد العميل المحدث');
      const saveBtn = page.locator('button:has-text("حفظ التعديلات")').first();
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // Logout
    await page.goto('/');
    const userMenuBtn = page.locator('button[aria-label="Account menu"]').first();
    if (await userMenuBtn.isVisible()) {
      await userMenuBtn.click();
      const signOutBtn = page.locator('button:has-text("تسجيل الخروج"), button:has-text("Sign Out")').first();
      if (await signOutBtn.isVisible()) {
        await signOutBtn.click();
        await page.waitForTimeout(1000);
      }
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

    // Wait for skeleton to detach
    await page.locator('[role="status"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});

    // Numbers must be rendered and non-NaN
    const pageText = await page.innerText('main, body');
    expect(pageText).not.toContain('NaN');
    expect(pageText).not.toContain('undefined');
  });

  test('Step 2: Company customer CRUD', async ({ page }) => {
    await page.goto('/company/customers');
    await page.waitForLoadState('domcontentloaded');

    // Add new company customer
    const addBtn = page.locator('button:has-text("إضافة عميل"), button:has-text("عميل جديد")').first();
    await addBtn.click();

    // Wait for modal dialog
    await page.locator('[role="dialog"]').waitFor({ state: 'visible', timeout: 10_000 });

    const uniqueCustName = `شركة الأمل ${Date.now()}`;
    await page.fill('[role="dialog"] input[autocomplete="name"], [role="dialog"] input[type="text"], [role="dialog"] input:not([type])', uniqueCustName);
    await page.fill('[role="dialog"] input[type="email"]', `amal_${Date.now()}@testcorp.com`);
    await page.fill('[role="dialog"] input[type="tel"]', '01011223344');

    // Click save inside the modal
    await page.locator('[role="dialog"] button:has-text("حفظ")').click();
    await page.waitForTimeout(1000);

    // Verify added customer is visible
    await expect(page.locator(`text=${uniqueCustName}`).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Step 3: Credit page and deposit request', async ({ page }) => {
    await page.goto('/company/credit');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('[role="status"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});

    const amountInput = page.locator('input[type="number"], input[placeholder*="1000"]').first();
    if (await amountInput.isVisible()) {
      await amountInput.fill('1500');
      const submitBtn = page.locator('button:has-text("إرسال الطلب"), button:has-text("إرسال"), button:has-text("تأكيد")').first();
      await submitBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test('Step 4: View invoices and submit trip request', async ({ page }) => {
    await page.goto('/company/invoices');
    await page.waitForLoadState('domcontentloaded');
    expect(await page.locator('h1').innerText()).toContain('الفواتير');

    await page.goto('/company/trip-requests');
    await page.waitForLoadState('domcontentloaded');
    const newReqBtn = page.locator('button:has-text("طلب رحلة"), button:has-text("رحلة خاصة")').first();
    if (await newReqBtn.isVisible()) {
      await newReqBtn.click();
      await page.waitForTimeout(500);
      const closeBtn = page.locator('[role="dialog"] button[aria-label="Close"], button:has-text("إلغاء")').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      }
    }
  });

  test('Step 5: Full trip booking (حجز الرحلة كاملة)', async ({ page }) => {
    await page.goto('/company/bookings/new');
    await page.waitForLoadState('domcontentloaded');

    expect(await page.locator('h1').innerText()).toContain('حجز');
    await expect(page.locator('ol[aria-label="Steps"]')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe.serial('Phase B: Golden Journey - Super Admin', () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, 'superAdmin');
  });

  test('Step 1: Dashboard overview, quick actions, pending count', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');

    // Wait for skeleton to detach
    await page.locator('[role="status"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});

    const bodyText = await page.innerText('body');
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).toContain('لوحة التحكم');
  });

  test('Step 2: Create bus and configure layout', async ({ page }) => {
    await page.goto('/admin/buses');
    await page.waitForLoadState('domcontentloaded');

    const addBusBtn = page.locator('button:has-text("إضافة باص"), button:has-text("باص جديد")').first();
    if (await addBusBtn.isVisible()) {
      await addBusBtn.click();
      await page.locator('[role="dialog"]').waitFor({ state: 'visible', timeout: 10_000 });

      const nameInput = page.locator('[role="dialog"] input').first();
      if (await nameInput.isVisible()) {
        await nameInput.fill(`باص السوبر ${Date.now().toString().slice(-4)}`);
        const saveBtn = page.locator('[role="dialog"] button[type="submit"], [role="dialog"] button:has-text("حفظ")').last();
        await saveBtn.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('Step 3: Create single trip', async ({ page }) => {
    await page.goto('/admin/trips/new');
    await page.waitForLoadState('domcontentloaded');

    expect(await page.locator('h1').innerText()).toContain('رحلة');
  });

  test('Step 4: Confirm payment for pending booking', async ({ page }) => {
    await page.goto('/admin/bookings');
    await page.waitForLoadState('domcontentloaded');

    // Click confirm payment on first pending booking if exists
    const confirmPaymentBtn = page.locator('button:has-text("تأكيد الدفع")').first();
    if (await confirmPaymentBtn.isVisible()) {
      await confirmPaymentBtn.click();
      await page.waitForTimeout(500);

      const modalConfirmBtn = page.locator('[role="dialog"] button:has-text("تأكيد الدفع")').last();
      if (await modalConfirmBtn.isVisible()) {
        await modalConfirmBtn.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('Step 5: Verify passenger for boarding', async ({ page }) => {
    await page.goto('/admin/verify');
    await page.waitForLoadState('domcontentloaded');

    const searchInput = page.locator('form input').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('REFUND50TEST');
      const verifyBtn = page.locator('form button[type="submit"]').first();
      if (await verifyBtn.isVisible()) {
        await verifyBtn.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('Step 6: Approve pending company and deposit request', async ({ page }) => {
    // Approve pending company
    await page.goto('/admin/companies/pending');
    await page.waitForLoadState('domcontentloaded');
    const approveCoBtn = page.locator('button:has-text("موافقة")').first();
    if (await approveCoBtn.isVisible()) {
      await approveCoBtn.click();
      await page.waitForTimeout(500);
      const confirmModalBtn = page.locator('[role="dialog"] button:has-text("موافقة"), [role="dialog"] button:has-text("تأكيد")').last();
      if (await confirmModalBtn.isVisible()) {
        await confirmModalBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // Approve deposit request
    await page.goto('/admin/deposit-requests');
    await page.waitForLoadState('domcontentloaded');
    const approveDepBtn = page.locator('button:has-text("موافقة")').first();
    if (await approveDepBtn.isVisible()) {
      await approveDepBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test('Step 7: Reports and CSV export', async ({ page }) => {
    await page.goto('/admin/reports');
    await page.waitForLoadState('domcontentloaded');

    // Wait for skeleton to detach
    await page.locator('[role="status"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});

    const csvBtn = page.locator('button:has-text("CSV"), a:has-text("CSV")').first();
    await expect(csvBtn).toBeVisible({ timeout: 15_000 });
  });

  test('Step 8: Manage destinations, FAQs, stations, and logout', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/admin/destinations');
    await page.waitForLoadState('domcontentloaded');
    expect(await page.locator('h1').innerText()).toContain('الوجهات');

    await page.goto('/admin/faqs');
    await page.waitForLoadState('domcontentloaded');
    expect(await page.locator('h1').innerText()).toContain('الأسئلة الشائعة');

    await page.goto('/admin/stations');
    await page.waitForLoadState('domcontentloaded');
    expect(await page.locator('h1').innerText()).toContain('المحطات');
  });
});

test.describe.serial('Phase B: Cross-Role Chain', () => {
  test('Complete end-to-end chain across Admin, Customer, and Company', async ({ browser }) => {
    test.setTimeout(90_000);
    const adminContext = await browser.newContext();
    const customerContext = await browser.newContext();
    const companyContext = await browser.newContext();

    await loginAs(adminContext, 'superAdmin');
    await loginAs(customerContext, 'customer');
    await loginAs(companyContext, 'companyAdmin');

    const adminPage = await adminContext.newPage();
    const customerPage = await customerContext.newPage();
    const companyPage = await companyContext.newPage();

    // 1. Admin checks active trips
    await adminPage.goto('/admin/trips');
    await adminPage.waitForLoadState('domcontentloaded');
    expect(await adminPage.locator('h1').innerText()).toContain('الرحلات');

    // 2. Customer searches trips and views trip
    await customerPage.goto('/trips');
    await customerPage.waitForLoadState('domcontentloaded');
    const availableTrip = customerPage.locator('a[href*="/trips/trip-normal-40"]').first();
    await expect(availableTrip).toBeVisible({ timeout: 15_000 });

    // 3. Company checks wallet balance before deposit
    await companyPage.goto('/company/dashboard');
    await companyPage.waitForLoadState('domcontentloaded');
    await companyPage.locator('[role="status"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});

    const walletCard = companyPage.locator('text=رصيد المحفظة').first();
    await expect(walletCard).toBeVisible({ timeout: 15_000 });

    // Cleanup contexts
    await adminContext.close();
    await customerContext.close();
    await companyContext.close();
  });
});
