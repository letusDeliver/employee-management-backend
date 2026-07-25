import { AuthUser } from '../../../core/auth/auth.models';

/**
 * `GET /users` returns `sanitizeUser(user, roles)` per user - roles
 * only, never `permissions` (verified against `backend/src/modules/
 * users/user.service.js`'s `listUsers()`; matches blueprint §7.1's rule
 * that only register/login/`/auth/me` attach a resolved permission
 * set). Same `Omit` derivation as Account's `ProfilePictureResponse`
 * (`features/account/data-access/account.models.ts`) rather than a
 * hand-duplicated interface.
 */
export type UserListItem = Omit<AuthUser, 'permissions'>;

export interface UsersResponse {
  users: UserListItem[];
}
