import bcrypt from 'bcryptjs';

import prisma from '../../config/database.js';
import userRepository from '../users/user.repository.js';
import rbacRepository from '../rbac/rbac.repository.js';
import employeeService from '../employees/employee.service.js';
import BadRequestError from '../../errors/BadRequestError.js';

const SALT_ROUNDS = 10;
const DEFAULT_ROLE_NAME = 'EMPLOYEE';

// Search-by-email-first (docs/domain-identity-employee-lifecycle.md ADR-008,
// §3's mandatory invariant) - reuse an existing User untouched (ignoring
// name/initialPassword) when one already exists for this email, exactly the
// Rehire Strategy (§2) the domain doc describes. Only a genuinely new User
// requires initialPassword: no invite-email mechanism exists anywhere in
// this project (verified, still true), so an admin-supplied initial
// credential is the only available mechanism, consistent with that domain's
// own "administrator-driven data entry" assumption (§8).
const resolveUser = async (accessProvisioning, tx) => {
  const { email, name, initialPassword } = accessProvisioning;
  const existingUser = await userRepository.findByEmail(email, tx);

  if (existingUser) {
    return existingUser;
  }

  if (!initialPassword) {
    throw new BadRequestError(
      'initialPassword: required when provisioning access for a candidate with no existing User account',
    );
  }

  const hashedPassword = await bcrypt.hash(initialPassword, SALT_ROUNDS);
  const createdUser = await userRepository.create({ email, password: hashedPassword, name }, tx);
  const defaultRole = await rbacRepository.findRoleByName(DEFAULT_ROLE_NAME, tx);
  await rbacRepository.assignRoleToUser(createdUser.id, defaultRole.id, tx);

  return createdUser;
};

// Implements docs/domain-identity-employee-lifecycle.md §2's "Onboarding"
// flow (Create Employee -> optionally provision system access, an explicit
// sub-decision, never automatic (ADR-005) -> search-by-email -> reuse or
// create a User -> link) - decided in full in that domain's sign-off but
// explicitly recorded there as "a new module, not yet built." Built here,
// narrowly scoped to onboarding only (the still-open "one Employee
// Lifecycle Service or two, covering onboarding+offboarding" question,
// §5 of that document, is untouched - offboarding stays exactly where it
// already lives, employee.service.js's softDeleteEmployee). This is the
// real target docs/domain-recruitment.md's ADR-RC03 (Hire Orchestration
// Service) needs to call.
//
// `accessProvisioning` omitted entirely -> Employee created unlinked,
// matching Identity's no-access-by-default. Provided -> the User
// reuse/creation and the Employee creation happen inside one transaction,
// so a partial failure can never leave an Employee believing it's linked
// to a User that doesn't exist (§3's mandatory invariant).
//
// Optional trailing `tx` (same additive shape as employeeService.
// createEmployee's own) lets application.service.js's hireApplication wrap
// this together with the JobRequisition openings-decrement and the
// Application's HIRED transition in one single outer transaction, instead
// of three independently-committing steps that a crash between them could
// leave partially applied.
const onboardEmployee = async (employeeData, accessProvisioning, actor, tx) => {
  const run = async (client) => {
    let userId;

    if (accessProvisioning) {
      const user = await resolveUser(accessProvisioning, client);
      userId = user.id;
    }

    const employee = await employeeService.createEmployee(
      { ...employeeData, userId },
      actor,
      client,
    );

    return { employee, userId: userId ?? null };
  };

  return tx ? run(tx) : prisma.$transaction(run);
};

export default { onboardEmployee };
