/**
 * The one currency every amount in the app is shown in (Employee salary, Payroll's payslips).
 * A placeholder: the backend stores amounts with no currency and assumes single-currency
 * operation (docs/domain-payroll.md §11), and no locale/currency setting exists yet. When one
 * does, this is the single place to read it from.
 */
export const APP_CURRENCY = 'USD';
