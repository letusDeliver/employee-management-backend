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
    ],
  },
];
