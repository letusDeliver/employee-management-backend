import 'dotenv/config';
import prismaClientPkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const { PrismaClient } = prismaClientPkg;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// One-time data migration for the Designation domain (docs/domain-designation.md,
// ADR-DS01/DS07): converts every Employee row's free-text `jobTitle` string
// into a real Designation row + `designationId` FK. Part 2 of the
// expand-migrate-contract sequence - run after the `add_designation_expand`
// migration (which added Designation + nullable designationId) and before
// the follow-up migration that drops `jobTitle` and makes `designationId`
// required. Includes soft-deleted Employee rows deliberately - the contract
// step makes designationId NOT NULL for every row, not just active ones.
const main = async () => {
  const employees = await prisma.employee.findMany({
    select: { id: true, jobTitle: true },
  });

  const distinctNames = [...new Set(employees.map((e) => e.jobTitle.trim()))];

  console.log(
    `Found ${employees.length} Employee rows, ${distinctNames.length} distinct jobTitle values.`,
  );

  const designationByName = new Map();

  for (const name of distinctNames) {
    const designation = await prisma.designation.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    designationByName.set(name, designation.id);
    console.log(`  Designation ready: "${name}" -> ${designation.id}`);
  }

  let updated = 0;

  for (const employee of employees) {
    const designationId = designationByName.get(employee.jobTitle.trim());
    await prisma.employee.update({
      where: { id: employee.id },
      data: { designationId },
    });
    updated += 1;
  }

  console.log(`Backfilled designationId on ${updated} Employee rows.`);

  const stillNull = await prisma.employee.count({ where: { designationId: null } });
  if (stillNull > 0) {
    throw new Error(
      `${stillNull} Employee row(s) still have a null designationId - do not proceed to the contract migration.`,
    );
  }

  console.log(
    'Verified: zero Employee rows with a null designationId. Safe to run the contract migration.',
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
