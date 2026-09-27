/**
 * A closed, code-defined set (docs/domain-employment-type.md, ADR-ET01) - not a
 * managed master-data table, so there is no endpoint, no directory and no screen:
 * just the four values the backend's Zod enum accepts, mirrored 1:1. Promoted from
 * `features/employees/` when Payroll became its second consumer (a payslip
 * snapshots the employment type it was calculated under).
 */
export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERN: 'Intern',
};

export const EMPLOYMENT_TYPE_OPTIONS: { value: EmploymentType; label: string }[] = EMPLOYMENT_TYPES.map((value) => ({
  value,
  label: EMPLOYMENT_TYPE_LABELS[value],
}));
