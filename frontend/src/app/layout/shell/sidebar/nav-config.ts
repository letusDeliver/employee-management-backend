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
];
