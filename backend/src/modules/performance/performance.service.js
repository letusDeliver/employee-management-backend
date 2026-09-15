import prisma from '../../config/database.js';
import performanceReviewRepository from './performanceReview.repository.js';
import reviewCycleService from '../reviewCycles/reviewCycle.service.js';
import employeeRepository from '../employees/employee.repository.js';
import departmentRepository from '../departments/department.repository.js';
import designationRepository from '../designations/designation.repository.js';
import branchRepository from '../branches/branch.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import NotFoundError from '../../errors/NotFoundError.js';
import ConflictError from '../../errors/ConflictError.js';
import ForbiddenError from '../../errors/ForbiddenError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const READ_ANY_PERMISSION = 'performanceReview:read:any';
const READ_OWN_PERMISSION = 'performanceReview:read:own';
const CREATE_ANY_PERMISSION = 'performanceReview:create:any';
const CREATE_REPORTS_PERMISSION = 'performanceReview:create:reports';
const MANAGE_ANY_PERMISSION = 'performanceReview:manage:any';
const MANAGE_REPORTS_PERMISSION = 'performanceReview:manage:reports';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

// ADMIN (create:any) may author a review for any employee, with any
// employee.managerId/reviewerId combination, and may explicitly supply
// reviewerId when the target employee has no manager. MANAGER
// (create:reports) may only author a review where THEY are the resolved
// reviewer - verified against the target Employee's own managerId, never
// a client-supplied reviewerId - the same deliberately narrower-than-":any"
// authority shape Leave's ADR-LV02 established for decide:reports.
const resolveReviewerId = async (employee, data, actor) => {
  if (actor.grantedPermissions.includes(CREATE_ANY_PERMISSION)) {
    const reviewerId = data.reviewerId ?? employee.managerId;

    if (!reviewerId) {
      throw new BadRequestError(
        'reviewerId: this employee has no manager - reviewerId must be provided explicitly',
      );
    }

    return reviewerId;
  }

  if (actor.grantedPermissions.includes(CREATE_REPORTS_PERMISSION)) {
    const managerEmployee = await employeeRepository.findByUserId(actor.id);

    if (!managerEmployee || employee.managerId !== managerEmployee.id) {
      throw new ForbiddenError('You do not have permission to author a review for this employee');
    }

    return managerEmployee.id;
  }

  throw new ForbiddenError('You do not have permission to author a performance review');
};

const createPerformanceReview = async (data, actor) => {
  const employee = await employeeRepository.findById(data.employeeId);

  if (!employee) {
    throw new BadRequestError('employeeId: references a record that does not exist');
  }

  await reviewCycleService.assertReviewCycleAssignable(data.reviewCycleId);

  const reviewerId = await resolveReviewerId(employee, data, actor);

  const existing = await performanceReviewRepository.findByEmployeeAndCycle(
    data.employeeId,
    data.reviewCycleId,
  );

  if (existing) {
    throw new ConflictError('A performance review already exists for this employee and cycle');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const review = await performanceReviewRepository.create(
        { employeeId: data.employeeId, reviewCycleId: data.reviewCycleId, reviewerId },
        tx,
      );

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.PERFORMANCE_REVIEW,
          entityId: review.id,
          beforeData: null,
          afterData: normalizeForAudit(review),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return review;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError('A performance review already exists for this employee and cycle');
    }

    throw error;
  }
};

// Shared by update/submit/delete/addendum - ADMIN (manage:any) may act on
// any review; MANAGER (manage:reports) only on reviews where they are the
// reviewer.
const assertCanManage = async (review, actor) => {
  if (actor.grantedPermissions.includes(MANAGE_ANY_PERMISSION)) {
    return;
  }

  if (actor.grantedPermissions.includes(MANAGE_REPORTS_PERMISSION)) {
    const managerEmployee = await employeeRepository.findByUserId(actor.id);

    if (managerEmployee && review.reviewerId === managerEmployee.id) {
      return;
    }
  }

  throw new ForbiddenError('You do not have permission to manage this performance review');
};

// Own-vs-any-vs-reports-vs-manage access check, shared by getById and
// addendum - "can manage" implies "can view," so manage:any/manage:reports
// are folded in here too, not just the read:* permissions.
const canAccessReview = async (review, actor) => {
  if (
    actor.grantedPermissions.includes(READ_ANY_PERMISSION) ||
    actor.grantedPermissions.includes(MANAGE_ANY_PERMISSION)
  ) {
    return true;
  }

  const ownEmployee = await employeeRepository.findByUserId(actor.id);

  if (!ownEmployee) {
    return false;
  }

  if (actor.grantedPermissions.includes(READ_OWN_PERMISSION) && ownEmployee.id === review.employeeId) {
    return true;
  }

  if (
    actor.grantedPermissions.includes(MANAGE_REPORTS_PERMISSION) &&
    ownEmployee.id === review.reviewerId
  ) {
    return true;
  }

  return false;
};

const assertCanView = async (review, requester) => {
  if (!(await canAccessReview(review, requester))) {
    throw new ForbiddenError('You do not have permission to view this performance review');
  }
};

// PATCH is only permitted while DRAFT - once Submitted, further
// correction goes through addenda (§2's immutability recommendation,
// applied here as a stricter, simpler-to-reason-about checkpoint).
const updatePerformanceReview = async (id, data, actor) => {
  const review = await performanceReviewRepository.findById(id);

  if (!review) {
    throw new NotFoundError('Performance review not found');
  }

  await assertCanManage(review, actor);

  if (review.status !== 'DRAFT') {
    throw new ConflictError('Only a Draft performance review can be edited');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await performanceReviewRepository.update(id, data, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.PERFORMANCE_REVIEW,
        entityId: id,
        beforeData: normalizeForAudit(review),
        afterData: normalizeForAudit(updated),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
};

// Org-context snapshot taken here, at submission, per ADR-PF03's explicit
// "at submission time" wording - not at creation, since the review's
// organizational context is only meaningful once the assessment is
// actually being finalized.
const submitPerformanceReview = async (id, actor) => {
  const review = await performanceReviewRepository.findById(id);

  if (!review) {
    throw new NotFoundError('Performance review not found');
  }

  await assertCanManage(review, actor);

  if (review.status !== 'DRAFT') {
    throw new ConflictError('Only a Draft performance review can be submitted');
  }

  if (!review.rating || !review.managerComments) {
    throw new BadRequestError(
      'Both rating and managerComments must be set before a review can be submitted',
    );
  }

  const employee = await employeeRepository.findById(review.employeeId);
  const [department, designation, branch] = await Promise.all([
    departmentRepository.findById(employee.departmentId),
    designationRepository.findById(employee.designationId),
    employee.branchId ? branchRepository.findById(employee.branchId) : Promise.resolve(null),
  ]);

  return prisma.$transaction(async (tx) => {
    const updated = await performanceReviewRepository.update(
      id,
      {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        departmentName: department.name,
        designationName: designation.name,
        branchName: branch?.name ?? null,
      },
      tx,
    );

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.PERFORMANCE_REVIEW,
        entityId: id,
        beforeData: normalizeForAudit(review),
        afterData: normalizeForAudit(updated),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
};

// The reviewed employee's own action - no manager/admin override exists,
// since acknowledgement is inherently a personal act, not a decision
// someone else can make on their behalf.
const acknowledgePerformanceReview = async (id, actor) => {
  const review = await performanceReviewRepository.findById(id);

  if (!review) {
    throw new NotFoundError('Performance review not found');
  }

  const ownEmployee = await employeeRepository.findByUserId(actor.id);

  if (!ownEmployee || ownEmployee.id !== review.employeeId) {
    throw new ForbiddenError('You do not have permission to acknowledge this performance review');
  }

  if (review.status !== 'SUBMITTED') {
    throw new ConflictError('Only a Submitted performance review can be acknowledged');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await performanceReviewRepository.update(
      id,
      { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
      tx,
    );

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.PERFORMANCE_REVIEW,
        entityId: id,
        beforeData: normalizeForAudit(review),
        afterData: normalizeForAudit(updated),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
};

// Settable by the reviewed employee any time before acknowledgement - the
// domain doc names self-assessment as optional without specifying
// sequencing relative to the manager's own submission, so this is not
// gated behind Submit.
const setSelfAssessment = async (id, data, actor) => {
  const review = await performanceReviewRepository.findById(id);

  if (!review) {
    throw new NotFoundError('Performance review not found');
  }

  const ownEmployee = await employeeRepository.findByUserId(actor.id);

  if (!ownEmployee || ownEmployee.id !== review.employeeId) {
    throw new ForbiddenError('You do not have permission to add a self-assessment to this review');
  }

  if (review.status === 'ACKNOWLEDGED') {
    throw new ConflictError('Cannot add a self-assessment to an already-acknowledged review');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await performanceReviewRepository.update(
      id,
      { selfComments: data.selfComments },
      tx,
    );

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.PERFORMANCE_REVIEW,
        entityId: id,
        beforeData: normalizeForAudit(review),
        afterData: normalizeForAudit(updated),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
};

// DRAFT-only, mirroring PayrollRun's DRAFT-only-delete convenience - by
// that status there is nothing (no addenda, no acknowledgement) to lose.
const deletePerformanceReview = async (id, actor) => {
  const review = await performanceReviewRepository.findById(id);

  if (!review) {
    throw new NotFoundError('Performance review not found');
  }

  await assertCanManage(review, actor);

  if (review.status !== 'DRAFT') {
    throw new ConflictError('Only a Draft performance review can be deleted');
  }

  await prisma.$transaction(async (tx) => {
    await performanceReviewRepository.remove(id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.PERFORMANCE_REVIEW,
        entityId: id,
        beforeData: normalizeForAudit(review),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });
};

const getPerformanceReviewById = async (id, requester) => {
  const review = await performanceReviewRepository.findById(id);

  if (!review) {
    throw new NotFoundError('Performance review not found');
  }

  await assertCanView(review, requester);

  return review;
};

const buildPerformanceReviewWhere = ({ employeeId, reviewCycleId, status }) => {
  const where = {};

  if (employeeId) where.employeeId = employeeId;
  if (reviewCycleId) where.reviewCycleId = reviewCycleId;
  if (status) where.status = status;

  return where;
};

// Auto-scopes like Leave's list endpoints, but with a third OR-branch: a
// caller without :read:any sees their own reviews (:read:own) and/or
// their reports' reviews (:manage:reports) - whichever they hold. Any
// employeeId filter they supply is folded into that scope, not honored
// verbatim, mirroring Leave's own-vs-any list precedent.
const listPerformanceReviews = async (query, requester) => {
  const { page, limit, sortBy, order, ...filters } = query;

  if (!requester.grantedPermissions.includes(READ_ANY_PERMISSION)) {
    const ownEmployee = await employeeRepository.findByUserId(requester.id);
    const scopeConditions = [];

    if (ownEmployee) {
      if (requester.grantedPermissions.includes(READ_OWN_PERMISSION)) {
        scopeConditions.push({ employeeId: ownEmployee.id });
      }

      if (requester.grantedPermissions.includes(MANAGE_REPORTS_PERMISSION)) {
        scopeConditions.push({ reviewerId: ownEmployee.id });
      }
    }

    if (scopeConditions.length === 0) {
      return { reviews: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }

    filters.OR = scopeConditions;
  }

  const { OR, ...restFilters } = filters;
  const where = buildPerformanceReviewWhere(restFilters);

  if (OR) {
    where.OR = OR;
  }

  const [reviews, total] = await Promise.all([
    performanceReviewRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    performanceReviewRepository.count(where),
  ]);

  return {
    reviews,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// No dedicated permission - gated by whichever read/manage permission
// already grants access to this specific review (reviewer, ADMIN, or the
// reviewed employee themselves). Append-only: there is no edit/delete for
// an addendum once added.
const addAddendum = async (id, data, actor) => {
  const review = await performanceReviewRepository.findById(id);

  if (!review) {
    throw new NotFoundError('Performance review not found');
  }

  if (!(await canAccessReview(review, actor))) {
    throw new ForbiddenError('You do not have permission to comment on this performance review');
  }

  return prisma.$transaction(async (tx) => {
    const addendum = await performanceReviewRepository.createAddendum(
      { performanceReviewId: id, authorId: actor.id, comment: data.comment },
      tx,
    );

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: AUDIT_ENTITY_TYPES.REVIEW_ADDENDUM,
        entityId: addendum.id,
        beforeData: null,
        afterData: normalizeForAudit(addendum),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return addendum;
  });
};

export default {
  createPerformanceReview,
  getPerformanceReviewById,
  listPerformanceReviews,
  updatePerformanceReview,
  submitPerformanceReview,
  acknowledgePerformanceReview,
  setSelfAssessment,
  deletePerformanceReview,
  addAddendum,
};
