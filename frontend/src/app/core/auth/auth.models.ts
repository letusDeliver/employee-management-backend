/**
 * The exact wire shape returned by `POST /auth/register`, `POST /auth/login`,
 * and `GET /auth/me` (verified against `backend/src/modules/users/user.service.js`'s
 * `sanitizeUser`/`attachPermissions` and `prisma/schema.prisma`'s `User` model).
 * No dto/domain split here (unlike `features/employees/`) - nothing about this
 * shape needs converting for display, so one interface serves both roles.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  profileImageUrl: string | null;
  profileImagePublicId: string | null;
  createdAt: string;
  updatedAt: string;
  roles: string[];
  permissions: string[];
}

export interface AuthSuccessResponse {
  message: string;
  user: AuthUser;
  accessToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface LogoutResponse {
  message: string;
}

export interface MeResponse {
  user: AuthUser;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}
