import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { redirectIfAuthenticatedGuard } from './core/auth/redirect-if-authenticated.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/public-layout/public-layout.component').then((m) => m.PublicLayoutComponent),
    canActivate: [redirectIfAuthenticatedGuard],
    children: [
      {
        path: '',
        // DISPOSABLE - see features/landing/landing-page.component.ts's own
        // header comment. Replaced wholesale by Feature 3.
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
    ],
  },
];
