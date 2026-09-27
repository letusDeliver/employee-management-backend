import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/permission.guard';

/**
 * `/performance-reviews` - the ledger (MANAGER: `manage:reports`, ADMIN: `manage:any`) and a review
 * opened from it. The '' child carries no crumb of its own (the wrapper in `app.routes.ts` owns it).
 * `data.origin` tells the shared review page where "back" goes.
 */
export const PERFORMANCE_REVIEW_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./review-ledger/review-ledger-page.component').then((m) => m.ReviewLedgerPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: ['performanceReview:manage:reports', 'performanceReview:manage:any'] },
  },
  {
    path: ':id',
    loadComponent: () => import('./review-detail/review-detail-page.component').then((m) => m.ReviewDetailPageComponent),
    canActivate: [permissionGuard],
    data: { breadcrumb: 'Review', permissions: ['performanceReview:manage:reports', 'performanceReview:manage:any'], origin: 'manage' },
  },
];

/** `/my-reviews` - every role (`performanceReview:read:own`). */
export const MY_REVIEW_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./my-reviews/my-reviews-page.component').then((m) => m.MyReviewsPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: ['performanceReview:read:own'] },
  },
  {
    path: ':id',
    loadComponent: () => import('./review-detail/review-detail-page.component').then((m) => m.ReviewDetailPageComponent),
    canActivate: [permissionGuard],
    data: { breadcrumb: 'Review', permissions: ['performanceReview:read:own'], origin: 'mine' },
  },
];
