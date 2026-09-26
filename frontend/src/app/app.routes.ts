import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { permissionGuard } from './core/auth/permission.guard';
import { redirectIfAuthenticatedGuard } from './core/auth/redirect-if-authenticated.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/public-layout/public-layout.component').then((m) => m.PublicLayoutComponent),
    canActivate: [redirectIfAuthenticatedGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/landing/landing-page.component').then((m) => m.LandingPageComponent),
      },
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login-page/login-page.component').then((m) => m.LoginPageComponent),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/register-page/register-page.component').then((m) => m.RegisterPageComponent),
      },
    ],
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page.component').then((m) => m.DashboardPageComponent),
        data: { breadcrumb: 'Dashboard' },
      },
      {
        path: 'account',
        loadComponent: () =>
          import('./features/account/account-page.component').then((m) => m.AccountPageComponent),
        data: { breadcrumb: 'Account' },
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/users/user-list-page/user-list-page.component').then(
            (m) => m.UserListPageComponent,
          ),
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Users', permissions: ['user:list'] },
      },
      {
        path: 'employees',
        loadChildren: () => import('./features/employees/employees.routes').then((m) => m.EMPLOYEES_ROUTES),
        // EMPLOYEES_ROUTES' 4 routes ('', 'new', ':id', ':id/edit') are flat
        // siblings, not nested under each other - this wrapper is the only real
        // ancestor they share, so it's the one place a parent "Employees" crumb
        // can live for New/Detail/Edit. Without it, BreadcrumbsComponent's walk
        // down the ActivatedRoute tree hits the matched leaf directly with no
        // "Employees" node above it to find.
        data: { breadcrumb: 'Employees' },
      },
      {
        // A single flat route, unlike 'employees' above - Branch's create/edit
        // is a dialog, not a routed sub-page, so there's nothing to nest here.
        path: 'branches',
        loadComponent: () =>
          import('./features/branches/branch-list/branch-list-page.component').then(
            (m) => m.BranchListPageComponent,
          ),
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Branches', permissions: ['branch:read'] },
      },
      {
        // Flat, same as 'branches' - create/edit is a dialog, not a routed sub-page.
        path: 'departments',
        loadComponent: () =>
          import('./features/departments/department-list/department-list-page.component').then(
            (m) => m.DepartmentListPageComponent,
          ),
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Departments', permissions: ['department:read'] },
      },
      {
        // Flat, same as 'departments' - create/edit is a dialog, not a routed sub-page.
        path: 'designations',
        loadComponent: () =>
          import('./features/designations/designation-list/designation-list-page.component').then(
            (m) => m.DesignationListPageComponent,
          ),
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Designations', permissions: ['designation:read'] },
      },
      {
        // Flat, same as 'designations' - create/edit is a dialog, not a routed sub-page.
        path: 'shifts',
        loadComponent: () =>
          import('./features/shifts/shift-list/shift-list-page.component').then((m) => m.ShiftListPageComponent),
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Shifts', permissions: ['shift:read'] },
      },
      {
        path: 'holiday-calendars',
        loadChildren: () =>
          import('./features/holiday-calendars/holiday-calendars.routes').then((m) => m.HOLIDAY_CALENDARS_ROUTES),
        // Same reason as 'employees': the list ('') and the detail (':id') are flat siblings, so this
        // wrapper is the one ancestor that can carry the parent crumb for the detail page.
        data: { breadcrumb: 'Holiday calendars' },
      },
      {
        // Flat, like 'shifts': one page, no nested routes. attendance:checkin is granted to every role
        // (docs/domain-attendance.md ADR-AT06), so this is every signed-in user's own check-in card.
        path: 'my-attendance',
        loadComponent: () =>
          import('./features/attendance/my-attendance/my-attendance-page.component').then(
            (m) => m.MyAttendancePageComponent,
          ),
        canActivate: [permissionGuard],
        data: { breadcrumb: 'My attendance', permissions: ['attendance:checkin'] },
      },
      {
        // Flat, like 'shifts': create/correct is a dialog, not a routed sub-page. The list needs
        // attendance:read:any (ADMIN and MANAGER) - GET /attendance is :any-only server-side.
        path: 'attendance',
        loadComponent: () =>
          import('./features/attendance/attendance-list/attendance-list-page.component').then(
            (m) => m.AttendanceListPageComponent,
          ),
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Attendance records', permissions: ['attendance:read:any'] },
      },
    ],
  },
];
