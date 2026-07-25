export interface NavItem {
  route: string;
  icon: string;
  label: string;
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
export const NAV_CONFIG: NavItem[] = [];
