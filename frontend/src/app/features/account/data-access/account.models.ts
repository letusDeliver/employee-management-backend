import { AuthUser } from '../../../core/auth/auth.models';

/**
 * `POST /users/me/profile-picture` and `DELETE /users/me/profile-picture`
 * both return this shape - `sanitizeUser()` + roles only, deliberately
 * never `permissions` (verified against `backend/src/modules/users/
 * user.service.js`; matches blueprint §7.1's rule that only register/
 * login/`/auth/me` attach a resolved permission set). `Omit` makes the
 * missing field a type-checked fact, not just a comment - `AccountStore`
 * can never accidentally treat this as a full `AuthUser` and merge it
 * wholesale into `SessionStore`.
 */
export interface ProfilePictureResponse {
  user: Omit<AuthUser, 'permissions'>;
}
