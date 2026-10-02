import { PrismaClient } from '@prisma/client';
import { encode } from '@auth/core/jwt';

const BASE_URL = 'http://127.0.0.1:3002';
const AUTH_SECRET = 'M1fX/C7/V+C/C/AVeI5lmi5FQoJulgZ4bE942NH691I=';
const DB_URL = 'file:d:/saas/desing/d 2/.scratch/dev-v2-scenarios.db';

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

async function makeToken(user) {
  if (!user) return null;
  return await encode({
    token: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId || undefined,
      sub: user.id,
    },
    secret: AUTH_SECRET,
    salt: 'next-auth.session-token',
  });
}

function reqHeaders(token, isJson = true) {
  const headers = {};
  if (token) headers['Cookie'] = `next-auth.session-token=${token}`;
  if (isJson) headers['Content-Type'] = 'application/json';
  return headers;
}

export async function runRoleMatrix() {
  console.log(`Running Role Matrix against ${BASE_URL}...`);

  const superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  const companyUser = await prisma.user.findFirst({ where: { role: 'COMPANY_ADMIN' } });
  const customer = await prisma.user.findFirst({ where: { role: 'CUSTOMER' } });

  const tokens = {
    anon: null,
    CUSTOMER: await makeToken(customer),
    COMPANY_ADMIN: await makeToken(companyUser),
    SUPER_ADMIN: await makeToken(superAdmin),
  };

  const faq = await prisma.faq.findFirst();
  const trip = await prisma.trip.findFirst();

  const routes = [
    {
      name: 'Transition Cron / Admin Trigger',
      path: '/api/jobs/transition',
      method: 'POST',
      body: {},
      expected: {
        anon: 401,
        CUSTOMER: 401,
        COMPANY_ADMIN: 401,
        SUPER_ADMIN: 200,
      },
    },
    {
      name: 'FAQ Reorder',
      path: `/api/faqs/${faq?.id || 'dummy'}/reorder`,
      method: 'PATCH',
      body: { newOrder: 1 },
      expected: {
        anon: 401,
        CUSTOMER: 401,
        COMPANY_ADMIN: 401,
        SUPER_ADMIN: 200,
      },
    },
    {
      name: 'Company Bookings',
      path: '/api/company/bookings',
      method: 'POST',
      body: {
        tripId: trip?.id || 'dummy',
        passengers: [{ seatLabel: 'S1', passengerName: 'Matrix Test' }],
      },
      expected: {
        anon: 401,
        CUSTOMER: 403,
        COMPANY_ADMIN: 200,
        SUPER_ADMIN: 200,
      },
    },
  ];

  const results = [];

  for (const r of routes) {
    for (const role of ['anon', 'CUSTOMER', 'COMPANY_ADMIN', 'SUPER_ADMIN']) {
      const token = tokens[role];
      const res = await fetch(`${BASE_URL}${r.path}`, {
        method: r.method,
        headers: reqHeaders(token),
        body: JSON.stringify(r.body),
      });

      const exp = r.expected[role];
      const match = res.status === exp ? 'Y' : 'N';
      results.push({
        route: r.path,
        method: r.method,
        role,
        expectedStatus: exp,
        actualStatus: res.status,
        match,
      });
      console.log(`[${r.method} ${r.path}] Role: ${role} -> Expected: ${exp}, Actual: ${res.status}, Match: ${match}`);
    }
  }

  console.log('\n=================== ROLE MATRIX SUMMARY ===================\n');
  console.log('| Route | Method | Role | Expected Status | Actual Status | Match (Y/N) |');
  console.log('| :--- | :---: | :--- | :---: | :---: | :---: |');
  for (const res of results) {
    console.log(`| \`${res.route}\` | \`${res.method}\` | \`${res.role}\` | ${res.expectedStatus} | ${res.actualStatus} | **${res.match}** |`);
  }

  await prisma.$disconnect();
  return results;
}

if (process.argv[1] === import.meta.filename) {
  runRoleMatrix().catch(console.error);
}
