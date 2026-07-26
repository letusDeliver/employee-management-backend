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
    ],
  },
];
