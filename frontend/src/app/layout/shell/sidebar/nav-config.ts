import { ICON_NAMES } from '../../../shared/icon-names';

export interface NavItem {
  route: string;
  icon: string;
  label: string;
  /** One-line description shown on the Dashboard's quick-navigation cards (blueprint §4.3). */
  description: string;
  /** Empty means visible to any authenticated user - no permission gate. */
  permissions: string[];
}

/**
 * The single source of truth for both the Sidebar and the Dashboard's
 * future quick-navigation cards (blueprint §3/§4.3) - reused, never
 * duplicated. Empty today; each feature (Employees, Users, Account) adds
 * its own entry as it ships, never restructuring this file or its
 * consumers.
 */
export const NAV_CONFIG: NavItem[] = [
  {
    route: '/account',
    icon: ICON_NAMES.accountCircle,
    label: 'Account',
    description: 'View your profile and manage your profile picture.',
    permissions: [],
  },
  {
    route: '/users',
    icon: ICON_NAMES.people,
    label: 'Users',
    description: 'View all registered users and their roles.',
    permissions: ['user:list'],
  },
  {
    // employee:read:any only, not also employee:read:own - GET /employees
    // (the list this route points to) is :any-only server-side; a plain
    // EMPLOYEE's :own only ever grants GET /employees/:id for their own
    // record, which has no discoverable link anywhere in this UI today.
    route: '/employees',
    icon: ICON_NAMES.badge,
    label: 'Employees',
    description: 'View and manage employee records.',
    permissions: ['employee:read:any'],
  },
  {
    // branch:read only, not create/update/delete - it's granted to all 3
    // roles server-side (docs/domain-branch.md ADR-B07), so this link is
    // visible to everyone; only the page's own New/Edit/Delete actions are
    // further gated on branch:create/:update/:delete.
    route: '/branches',
    icon: ICON_NAMES.locationOn,
    label: 'Branches',
    description: 'Manage branch and location master data.',
    permissions: ['branch:read'],
  },
  {
    // department:read only - granted to all 3 roles server-side
    // (docs/domain-department.md ADR-D08), so this link is visible to
    // everyone; New/Edit/Delete are further gated in-page.
    route: '/departments',
    icon: ICON_NAMES.apartment,
    label: 'Departments',
    description: 'Manage department master data.',
    permissions: ['department:read'],
  },
  {
    // designation:read only - granted to all 3 roles server-side
    // (docs/domain-designation.md ADR-DS06), so this link is visible to
    // everyone; New/Edit/Delete are further gated in-page.
    route: '/designations',
    icon: ICON_NAMES.work,
    label: 'Designations',
    description: 'Manage job title master data.',
    permissions: ['designation:read'],
  },
  {
    // shift:read only - granted to all 3 roles server-side (docs/domain-shift.md), so this
    // link is visible to everyone; New/Edit/Delete are ADMIN-only and gated in-page.
    route: '/shifts',
    icon: ICON_NAMES.schedule,
    label: 'Shifts',
    description: 'Manage working hours and days.',
    permissions: ['shift:read'],
  },
  {
    // holidayCalendar:read only - granted to all 3 roles server-side (docs/domain-holiday-calendar.md
    // ADR-HC06), so this link is visible to everyone; every mutation is ADMIN-only and gated in-page.
    route: '/holiday-calendars',
    icon: ICON_NAMES.event,
    label: 'Holiday calendars',
    description: 'Manage holiday dates for branches.',
    permissions: ['holidayCalendar:read'],
  },
];
