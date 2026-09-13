import 'dotenv/config';
import prismaClientPkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const { PrismaClient } = prismaClientPkg;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// One-time data migration for the Department domain (docs/domain-department.md,
// ADR-D01/D07): converts every Employee row's free-text `department` string
// into a real Department row + `departmentId` FK. Part 2 of the
// expand-migrate-contract sequence - run after the `add_department_expand`
// migration (which added Department + nullable departmentId) and before the
// follow-up migration that drops `department` and makes `departmentId`
// required. Includes soft-deleted Employee rows deliberately - the contract
// step makes departmentId NOT NULL for every row, not just active ones.
const main = async () => {
  const employees = await prisma.employee.findMany({
    select: { id: true, department: true },
  });

  const distinctNames = [...new Set(employees.map((e) => e.department.trim()))];

  console.log(
    `Found ${employees.length} Employee rows, ${distinctNames.length} distinct department values.`,
  );

  const departmentByName = new Map();

  for (const name of distinctNames) {
    const department = await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    departmentByName.set(name, department.id);
    console.log(`  Department ready: "${name}" -> ${department.id}`);
  }

  let updated = 0;

  for (const employee of employees) {
    const departmentId = departmentByName.get(employee.department.trim());
    await prisma.employee.update({
      where: { id: employee.id },
      data: { departmentId },
    });
    updated += 1;
  }

  console.log(`Backfilled departmentId on ${updated} Employee rows.`);

  const stillNull = await prisma.employee.count({ where: { departmentId: null } });
  if (stillNull > 0) {
    throw new Error(
      `${stillNull} Employee row(s) still have a null departmentId - do not proceed to the contract migration.`,
    );
  }

  console.log(
    'Verified: zero Employee rows with a null departmentId. Safe to run the contract migration.',
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
