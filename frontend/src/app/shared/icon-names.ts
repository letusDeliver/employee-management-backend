/**
 * The one place `<mat-icon>` names are referenced from — mirrors the backend's
 * frozen-object convention for `AUDIT_ACTIONS`/`AUDIT_ENTITY_TYPES`. Every key maps to
 * a real Material Symbols Outlined glyph name (see index.html's font import).
 *
 * Empty until a feature actually needs an icon — entries are added as features consume
 * them, never speculatively.
 */
export const ICON_NAMES = {
  logout: 'logout',
  accountCircle: 'account_circle',
  menu: 'menu',
  visibility: 'visibility',
  visibilityOff: 'visibility_off',
  error: 'error',
} as const satisfies Record<string, string>;

export type IconName = keyof typeof ICON_NAMES;
