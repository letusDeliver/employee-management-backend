import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/permission.guard';

/**
 * `holidayCalendar:read` is granted to every role (docs/domain-holiday-calendar.md ADR-HC06), so
 * both routes are open to any signed-in user; adding, editing and deleting are gated in-page.
 */
export const HOLIDAY_CALENDARS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./holiday-calendar-list/holiday-calendar-list-page.component').then(
        (m) => m.HolidayCalendarListPageComponent,
      ),
    canActivate: [permissionGuard],
    // No breadcrumb here - the parent 'holiday-calendars' route in app.routes.ts owns that single
    // crumb. Setting it here too would show "Holiday calendars > Holiday calendars" on the list page.
    data: { permissions: ['holidayCalendar:read'] },
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./holiday-calendar-detail/holiday-calendar-detail-page.component').then(
        (m) => m.HolidayCalendarDetailPageComponent,
      ),
    canActivate: [permissionGuard],
    data: { breadcrumb: 'Holidays', permissions: ['holidayCalendar:read'] },
  },
];
