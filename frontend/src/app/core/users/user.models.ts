import { AuthUser } from '../auth/auth.models';

/**
 * `GET /users` returns `sanitizeUser(user, roles)` per user - roles
 * only, never `permissions` (verified against `backend/src/modules/
 * users/user.service.js`'s `listUsers()`; matches blueprint §7.1's rule
 * that only register/login/`/auth/me` attach a resolved permission
 * set). Same `Omit` derivation as Account's `ProfilePictureResponse`
 * rather than a hand-duplicated interface.
 *
 * Moved here from `features/users/data-access/` in Feature 6
 * (Employees) - this shape is now a cross-feature, `core/`-owned
 * concern (blueprint §1: cross-feature communication goes through
 * `core/`, never a direct feature-to-feature import). See
 * `user-directory.service.ts`.
 */
export type UserListItem = Omit<AuthUser, 'permissions'>;

export interface UsersResponse {
  users: UserListItem[];
}
