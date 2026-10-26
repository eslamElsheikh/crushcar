import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { creditLimitValueSchema } from '@/lib/validations'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { creditLimit, paymentMode, billingCycle, action } = await req.json()

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const company = await prisma.company.findUnique({ where: { id } })
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

if (action === 'reject') {
      // Rejecting has to take the company's admins with it.
      //
      // User.company is an optional relation, so the schema is ON DELETE SET
      // NULL: deleting the company does not fail, it quietly detaches the
      // user. The result is worse than an error — a COMPANY_ADMIN with
      // companyId null still passes the sign-in guard in src/lib/auth.ts,
      // because that guard only fires when the company exists and is inactive.
      // They get a working session and then a 400 "No company linked" from
      // every /api/company route, and the users table reports them as active.
      //
      // The application was refused, so the account should not survive it.
      // Detaching instead of deleting would leave exactly that half-state.
      const rejected = await prisma.$transaction(async (tx) => {
        const { count } = await tx.user.deleteMany({ where: { companyId: id } });
        await tx.company.delete({ where: { id } });
        return count;
      });
      return NextResponse.json({
        success: true,
        message: 'Company rejected and removed',
        removedUsers: rejected,
      });
    }

    // The credit limit an approval sets is a change to the company's
    // exposure, and it is written down like any other change: the limit
    // before and after, the exact change, the reason, and who approved it.
    //
    // Nothing is written when the limit did not actually move — a log row
    // recording a change of zero is a record of nothing.
    //
    // The same rule the other two paths apply: a limit is a ceiling on what
    // a company may owe, and a negative one is not a smaller allowance. It
    // is refused here rather than stored.
    let newCreditLimit = 0;
    if (creditLimit !== undefined && creditLimit !== null && creditLimit !== '') {
      const parsed = creditLimitValueSchema.safeParse(Number(creditLimit));
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
      }
      newCreditLimit = parsed.data;
    }
    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.company.findUnique({
        where: { id },
        select: { creditLimit: true },
      });
      const previousLimit = before?.creditLimit ?? 0;
      const changeAmount = newCreditLimit - previousLimit;

      const company = await tx.company.update({
        where: { id },
        data: {
          isActive: true,
          creditLimit: newCreditLimit,
          paymentMode: paymentMode || 'PREPAID',
          billingCycle: billingCycle || 'MONTHLY',
        },
        include: {
          users: {
            where: { role: 'COMPANY_ADMIN' },
            select: { id: true, name: true, email: true },
          },
        },
      });

      if (changeAmount !== 0) {
        await tx.creditLog.create({
          data: {
            companyId: id,
            previousLimit,
            newLimit: newCreditLimit,
            changeAmount,
            reason: 'Credit limit set when the company was approved',
            createdById: session.user.id,
            createdByEmail: session.user.email || '',
          },
        });
        await audit({
          action: 'UPDATE',
          entity: 'CreditLimit',
          entityId: id,
          companyId: id,
          session,
          metadata: { previousLimit, newLimit: newCreditLimit, changeAmount, reason: 'Company approval' },
          client: tx,
        });
      }

      return company;
    });

    return NextResponse.json({
      success: true,
      message: 'Company activated successfully',
      company: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
      },
    })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
