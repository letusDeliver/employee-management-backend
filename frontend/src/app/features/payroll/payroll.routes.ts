import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/permission.guard';

/**
 * `/payroll` - ADMIN only (`payrollRun:read`, ADR-PR06). ':runId' is a wrapper so it can carry the
 * run's crumb for BOTH its own page ('') and a payslip opened from it ('payslips/:payslipId'):
 * Payroll > Payroll run > Payslip. The '' children carry no breadcrumb of their own, or the crumb
 * would repeat.
 */
export const PAYROLL_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./payroll-run-list/payroll-run-list-page.component').then((m) => m.PayrollRunListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: ['payrollRun:read'] },
  },
  {
    path: ':runId',
    data: { breadcrumb: 'Payroll run' },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./payroll-run-detail/payroll-run-detail-page.component').then((m) => m.PayrollRunDetailPageComponent),
        canActivate: [permissionGuard],
        data: { permissions: ['payrollRun:read'] },
      },
      {
        path: 'payslips/:payslipId',
        loadComponent: () =>
          import('./payslip-detail/payslip-detail-page.component').then((m) => m.PayslipDetailPageComponent),
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Payslip', permissions: ['payslip:read:any'], origin: 'payroll' },
      },
    ],
  },
];

/** `/my-payslips` - every role (`payslip:read:own`). */
export const MY_PAYSLIPS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./my-payslips/my-payslips-page.component').then((m) => m.MyPayslipsPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: ['payslip:read:own'] },
  },
  {
    path: ':payslipId',
    loadComponent: () =>
      import('./payslip-detail/payslip-detail-page.component').then((m) => m.PayslipDetailPageComponent),
    canActivate: [permissionGuard],
    data: { breadcrumb: 'Payslip', permissions: ['payslip:read:own'], origin: 'mine' },
  },
];
