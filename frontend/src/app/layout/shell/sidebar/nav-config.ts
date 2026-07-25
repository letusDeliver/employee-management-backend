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
];
