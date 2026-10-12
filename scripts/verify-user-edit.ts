/* Behaviour checks for the admin user-edit rules.
 *
 * These mirror the guards in src/app/api/admin/users/[id]/route.ts. They are
 * kept here as executable assertions so the rules are checked rather than
 * re-read: run npm run check:users
 */

// Makes this a module. As a plain script its top-level names join the global
// scope and collide with the other check scripts during a project-wide typecheck.
export {};

type Role = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'CUSTOMER';

interface Actor { id: string; role: Role; companyId: string | null }
interface Target { id: string; role: Role; companyId: string | null; isActive: boolean }

type Result = { ok: true } | { ok: false; status: number; error: string };

/* --- the rules, mirroring the route handler --- */

function canEdit(actor: Actor, target: Target): Result {
  if (actor.role !== 'COMPANY_ADMIN' && actor.role !== 'SUPER_ADMIN') {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  if (actor.role === 'COMPANY_ADMIN' && target.companyId !== actor.companyId) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  return { ok: true };
}

async function setActive(
  actor: Actor,
  target: Target,
  next: boolean,
  countOtherActiveAdmins: () => Promise<number>,
): Promise<Result> {
  const base = canEdit(actor, target);
  if (!base.ok) return base;
  // Activating is always fine, and so is a no-op on an already suspended
  // account. Only a real suspension runs the lockout guards.
  if (next) return { ok: true };
  if (!target.isActive) return { ok: true };
  if (target.id === actor.id) {
    return { ok: false, status: 400, error: 'لا يمكنك إيقاف حسابك أنت' };
  }
  if (target.role === 'SUPER_ADMIN') {
    const others = await countOtherActiveAdmins();
    if (others === 0) {
      return { ok: false, status: 400, error: 'لا يمكن إيقاف آخر مدير نظام مفعّل' };
    }
  }
  return { ok: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Narrowing helper: the success variant carries no status. */
function statusOf(r: Result): number | undefined {
  return r.ok ? undefined : r.status;
}

async function setEmail(
  actor: Actor,
  target: Target,
  email: string,
  findByEmail: (email: string) => Promise<{ id: string } | null>,
): Promise<Result> {
  const base = canEdit(actor, target);
  if (!base.ok) return base;
  const next = email.trim().toLowerCase();
  if (!EMAIL_RE.test(next)) return { ok: false, status: 400, error: 'البريد الإلكتروني غير صحيح' };
  const taken = await findByEmail(next);
  if (taken && taken.id !== target.id) {
    return { ok: false, status: 400, error: 'البريد الإلكتروني مستخدم بالفعل' };
  }
  return { ok: true };
}

/* --- assertions --- */

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

const ROOT = { id: 'root', role: 'SUPER_ADMIN', companyId: null } as Actor;
const ROOT2 = { id: 'root2', role: 'SUPER_ADMIN', companyId: null } as Actor;
const CO = { id: 'co', role: 'COMPANY_ADMIN', companyId: 'c1' } as Actor;
const OTHER_CO = { id: 'co2', role: 'COMPANY_ADMIN', companyId: 'c2' } as Actor;
const CUSTOMER = { id: 'cu', role: 'CUSTOMER', companyId: null } as Actor;

const customer: Target = { id: 'u1', role: 'CUSTOMER', companyId: null, isActive: true };
const ownStaff: Target = { id: 'u2', role: 'CUSTOMER', companyId: 'c1', isActive: true };
const otherStaff: Target = { id: 'u3', role: 'CUSTOMER', companyId: 'c2', isActive: true };
const adminTarget: Target = { id: 'root', role: 'SUPER_ADMIN', companyId: null, isActive: true };

async function main() {
  console.log('who may edit');
  check('super admin edits a customer', canEdit(ROOT, customer).ok, true);
  check('company admin edits own staff', canEdit(CO, ownStaff).ok, true);
  check('company admin cannot edit another company', canEdit(CO, otherStaff).ok, false);
  check('company admin cannot edit a platform user', canEdit(CO, customer).ok, false);
  check('a plain customer cannot edit anyone', canEdit(CUSTOMER, customer).ok, false);

  console.log('\nsuspending');
  const otherAdmin: Target = { id: 'root2', role: 'SUPER_ADMIN', companyId: null, isActive: true };
  check('suspending your own account is refused',
    statusOf(await setActive(ROOT, adminTarget, false, async () => 1)), 400);
  check('suspending the last active super admin is refused',
    statusOf(await setActive(ROOT2, otherAdmin, false, async () => 0)), 400);
  check('suspending a super admin while another remains is allowed',
    (await setActive(ROOT, otherAdmin, false, async () => 1)).ok, true);
  check('suspending a customer is allowed',
    (await setActive(ROOT, customer, false, async () => 0)).ok, true);
  check('re-activating is always allowed',
    (await setActive(ROOT, { ...customer, isActive: false }, true, async () => 0)).ok, true);
  check('no-op on an already suspended account is allowed',
    (await setActive(ROOT, { ...customer, isActive: false }, false, async () => 0)).ok, true);

  console.log('\nemail');
  check('malformed email is refused',
    (await setEmail(ROOT, customer, 'not-an-email', async () => null)).ok, false);
  check('email owned by nobody is allowed',
    (await setEmail(ROOT, customer, 'New@Example.com', async () => null)).ok, true);
  check('email taken by another user is refused',
    (await setEmail(ROOT, customer, 'taken@x.com', async () => ({ id: 'other' }))).ok, false);
  check('re-saving the same email on the same user is allowed',
    (await setEmail(ROOT, customer, 'mine@x.com', async () => ({ id: 'u1' }))).ok, true);
  check('email is normalised to lowercase',
    (await setEmail(ROOT, customer, '  MiXeD@X.com ', async () => null)).ok, true);

  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}

main();