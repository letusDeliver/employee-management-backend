import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/permission.guard';

/**
 * `GET /employees` (the list) is `employee:read:any`-only - confirmed
 * live against the real backend (`employee.routes.js`), unlike
 * `GET /employees/:id` which also accepts `employee:read:own`. A plain
 * `EMPLOYEE` (only `:own`) therefore cannot reach this list route at
 * all - matches `NAV_CONFIG`'s entry, which is `:any`-only for exactly
 * this reason.
 */
export const EMPLOYEES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./employee-list/employee-list-page.component').then((m) => m.EmployeeListPageComponent),
    canActivate: [permissionGuard],
    data: { breadcrumb: 'Employees', permissions: ['employee:read:any'] },
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./employee-form/employee-form.component').then((m) => m.EmployeeFormPageComponent),
    canActivate: [permissionGuard],
    data: { breadcrumb: 'New Employee', permissions: ['employee:create'] },
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./employee-detail/employee-detail-page.component').then((m) => m.EmployeeDetailPageComponent),
    canActivate: [permissionGuard],
    data: { breadcrumb: 'Employee', permissions: ['employee:read:any', 'employee:read:own'] },
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./employee-form/employee-form.component').then((m) => m.EmployeeFormPageComponent),
    canActivate: [permissionGuard],
    data: { breadcrumb: 'Edit Employee', permissions: ['employee:update:any'] },
  },
];
