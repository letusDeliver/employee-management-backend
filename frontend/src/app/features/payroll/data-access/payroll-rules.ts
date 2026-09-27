import { StatusTone } from '../../../shared/components/status-pill/status-pill.component';
import { PayrollRunStatus } from './payroll.dto';

/** Wording, tone and glyph of the four run statuses (a glyph AND a word, never colour alone). */
export const RUN_STATUS_META: Record<PayrollRunStatus, { label: string; tone: StatusTone; icon: string }> = {
  DRAFT: { label: 'Draft', tone: 'neutral', icon: 'edit_note' },
  PROCESSING: { label: 'Processing', tone: 'info', icon: 'fact_check' },
  FINALIZED: { label: 'Finalized', tone: 'warning', icon: 'lock' },
  PAID: { label: 'Paid', tone: 'success', icon: 'check_circle' },
};

/** The lifecycle in order (docs/domain-payroll.md §2) - the order the detail page's steps show. */
export const RUN_STATUSES: readonly PayrollRunStatus[] = ['DRAFT', 'PROCESSING', 'FINALIZED', 'PAID'];

/**
 * "Processing" is the server's word for "payslips generated, not yet final" - not "still running"
 * (processing is one synchronous request). The detail page says so under the steps.
 */
export const RUN_STATUS_HINT: Record<PayrollRunStatus, string> = {
  DRAFT: 'No payslips yet. Process the run to generate them.',
  PROCESSING: 'Payslips generated. Review them, then finalize.',
  FINALIZED: 'Payslips are final. Record the payment once it has been made.',
  PAID: 'Paid. This run is complete.',
};

export type RunAction = 'process' | 'finalize' | 'markPaid';

/**
 * The ONE transition the server accepts from each status (`payroll.service.js`): DRAFT -> process,
 * PROCESSING -> finalize, FINALIZED -> mark paid, PAID -> nothing. Anything else is a 409, so the UI
 * never offers it.
 */
export function nextAction(run: { status: PayrollRunStatus }): RunAction | null {
  switch (run.status) {
    case 'DRAFT':
      return 'process';
    case 'PROCESSING':
      return 'finalize';
    case 'FINALIZED':
      return 'markPaid';
    default:
      return null;
  }
}

/**
 * Only a DRAFT run can be deleted - it has no payslips yet. Once processed, a run can be neither
 * deleted nor processed again: processing is the irreversible step, not finalizing.
 */
export const canDelete = (run: { status: PayrollRunStatus }): boolean => run.status === 'DRAFT';

export const RUN_ACTION_LABEL: Record<RunAction, string> = {
  process: 'Process payroll',
  finalize: 'Finalize',
  markPaid: 'Mark as paid',
};

export const MONTH_OPTIONS: readonly { value: number; label: string }[] = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, index, 1))),
}));

/** "August 2026". English month names, like the rest of the app's copy. */
export const periodLabel = (periodMonth: number, periodYear: number): string =>
  `${MONTH_OPTIONS[periodMonth - 1]?.label ?? `Month ${periodMonth}`} ${periodYear}`;

const yearMonthOf = (serverDay: string) => ({
  year: Number(serverDay.slice(0, 4)),
  month: Number(serverDay.slice(5, 7)),
});

/**
 * Has the period fully passed by the SERVER's day (`serverToday()`, UTC - the day the backend files
 * attendance under)? Processing an unfinished month is allowed by the backend, but every remaining
 * day has no attendance record and is counted as unpaid, so the confirm warns - it does not block.
 */
export function isPeriodOver(run: { periodMonth: number; periodYear: number }, serverDay: string): boolean {
  const today = yearMonthOf(serverDay);
  return run.periodYear < today.year || (run.periodYear === today.year && run.periodMonth < today.month);
}

/** A new run defaults to LAST month by the server's day - the usual case, and a month that is over. */
export function defaultNewRunPeriod(serverDay: string): { periodMonth: number; periodYear: number } {
  const today = yearMonthOf(serverDay);
  return today.month === 1
    ? { periodMonth: 12, periodYear: today.year - 1 }
    : { periodMonth: today.month - 1, periodYear: today.year };
}

/** "21", "20.5", "0" - at most two decimals, no trailing zeros. */
export const formatDays = (days: number): string => String(Math.round(days * 100) / 100);

/** A payslip's employee as snapshotted: the name, or an honest placeholder - never an id. */
export const payslipEmployeeName = (payslip: { employeeName: string | null }): string =>
  payslip.employeeName ?? 'No name on record';

/** The snapshot's second line: "Designation · Department". */
export const payslipRoleLine = (payslip: { designationName: string; departmentName: string }): string =>
  `${payslip.designationName} · ${payslip.departmentName}`;

/** Newest period first: year, then month. Used where the server can only sort by one key. */
export const byPeriodDesc = (
  a: { periodYear: number; periodMonth: number },
  b: { periodYear: number; periodMonth: number },
): number => b.periodYear - a.periodYear || b.periodMonth - a.periodMonth;
