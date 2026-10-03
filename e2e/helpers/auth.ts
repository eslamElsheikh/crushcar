import { BrowserContext, Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';

const AUTH_SECRET = process.env.AUTH_SECRET || 'M1fX/C7/V+C/C/AVeI5lmi5FQoJulgZ4bE942NH691I=';

export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'CUSTOMER';
  companyId?: string;
}

export const USERS: Record<string, TestUser & { password: string }> = {
  superAdmin: {
    id: 'user-superadmin',
    name: 'Super Admin',
    email: 'superadmin@crushcar.com',
    password: 'super123',
    role: 'SUPER_ADMIN',
  },
  customer: {
    id: 'user-customer',
    name: 'Mohamed Customer',
    email: 'user@example.com',
    password: 'user123',
    role: 'CUSTOMER',
  },
  companyAdmin: {
    id: 'user-company-admin',
    name: 'Ahmed Cairo',
    email: 'admin@cairoexpress.com',
    password: 'admin123',
    role: 'COMPANY_ADMIN',
    companyId: 'comp-cairo-express',
  },
  zeroCreditAdmin: {
    id: 'user-company-zero',
    name: 'Zero Admin',
    email: 'admin@zerocredit.com',
    password: 'admin123',
    role: 'COMPANY_ADMIN',
    companyId: 'comp-zero-credit',
  },
  noBusAdmin: {
    id: 'user-company-nobus',
    name: 'NoBus Admin',
    email: 'admin@nobus.com',
    password: 'admin123',
    role: 'COMPANY_ADMIN',
    companyId: 'comp-no-bus',
  },
  pendingAdmin: {
    id: 'user-company-pending',
    name: 'Pending Admin',
    email: 'admin@pendingco.com',
    password: 'admin123',
    role: 'COMPANY_ADMIN',
    companyId: 'comp-pending',
  },
  disabledUser: {
    id: 'user-disabled',
    name: 'Disabled User',
    email: 'disabled@example.com',
    password: 'user123',
    role: 'CUSTOMER',
  },
};

export async function loginAs(context: BrowserContext, userKey: keyof typeof USERS) {
  const user = USERS[userKey];
  const token = await encode({
    token: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      sub: user.id,
    },
    secret: AUTH_SECRET,
    salt: 'next-auth.session-token',
  });

  await context.addCookies([
    {
      name: 'next-auth.session-token',
      value: token,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: 'next-auth.session-token',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

export async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
}
