# Feature 7: JWT Access + Refresh Tokens — Action Plan

Status: **Awaiting review/approval**. Nothing below has been executed yet.

## Scope

Issue real JWT access + refresh tokens on register/login, add a
database-backed refresh-token table with rotation and revocation, an auth
middleware that protects routes by verifying the access token, and enough
new endpoints (`/refresh`, `/logout`, `/me`) to prove the whole chain
works end to end. RBAC (checking `role` to authorize specific actions) is
still a separate future feature — this one only establishes _who the
caller is_, not _what they're allowed to do_.

## Confirmed decisions (from the theory discussion)

- Refresh token delivered via an httpOnly, Secure, SameSite cookie — not
  the JSON response body.
- Refresh tokens are database-backed (hashed) — revocable, with rotation
  on every use.

## Actions

1. **Install `jsonwebtoken` and `cookie-parser`** (dependencies). Verify
   `jsonwebtoken`'s actual sign/verify API in a scratch script before
   writing `utils/jwt.js` for real — continuing this project's established
   habit, given how often "assumed" library behavior has turned out to
   need correcting so far.

2. **Extend `src/config/env.js`'s Zod schema** — add `JWT_ACCESS_SECRET`
   (min length enforced, no default), `JWT_ACCESS_EXPIRES_IN` (default
   `'15m'`), `JWT_REFRESH_SECRET` (min length enforced, no default,
   different secret from access), `JWT_REFRESH_EXPIRES_IN` (default
   `'7d'`). **You'll need to confirm your real `.env` has sufficiently
   long, random values for both secrets** — the placeholder values in
   `.env.example` are illustrative only and will fail the new minimum-
   length check on purpose.

3. **Update `prisma/schema.prisma`** — add a `RefreshToken` model and the
   `User` back-relation:

   ```prisma
   model RefreshToken {
     id        String   @id @default(uuid())
     tokenHash String   @unique
     userId    String
     user      User     @relation(fields: [userId], references: [id])
     expiresAt DateTime
     revoked   Boolean  @default(false)
     createdAt DateTime @default(now())
   }
   ```

   Plus `refreshTokens RefreshToken[]` added to `User`.

4. **Run `npx prisma migrate dev --name add_refresh_token_model`.**

5. **Create `src/utils/jwt.js`** — `signAccessToken(payload)`,
   `signRefreshToken(payload)`, `verifyAccessToken(token)`,
   `verifyRefreshToken(token)`. Payload is minimal: `{ sub: user.id, role:
user.role }` — never email/name, since JWT payloads are readable by
   anyone holding the token, not just the server.

6. **Create `src/modules/auth/refreshToken.repository.js`** — Prisma
   queries for the `RefreshToken` table: `create`, `findValidByHash`
   (matches hash, not revoked, not expired), `revoke`, `revokeAllForUser`.

7. **Update `src/modules/auth/auth.service.js`**:
   - `register`/`login` now also issue a token pair after the existing
     verification logic: sign an access token, sign+hash+store a refresh
     token, return `{ user, accessToken }` (the refresh token itself never
     leaves the service as plain response data — it's set as a cookie by
     the controller).
   - `refresh(refreshToken)`: verify the JWT signature/expiry, look up its
     hash in the database (must exist, not be revoked, not be expired),
     **rotate**: revoke the old DB record, issue and store a new refresh
     token + a new access token.
   - `logout(refreshToken)`: verify + look up, then revoke that specific
     DB record.

8. **Create `src/middlewares/auth.middleware.js`** — extracts the Bearer
   access token from `Authorization`, verifies it via `utils/jwt.js`,
   attaches `req.user = { id, role }` from the token payload, calls
   `next()`. Throws `UnauthorizedError` on missing/invalid/expired tokens.

9. **Update `src/modules/auth/auth.controller.js`**:
   - `register`/`login`: set the refresh token as an httpOnly, Secure,
     SameSite cookie; respond with `{ message, user, accessToken }` (no
     refresh token in the body).
   - `refresh`: reads the refresh token from the cookie, calls the
     service, re-sets the rotated cookie, responds with the new
     `accessToken`.
   - `logout`: reads the cookie, revokes it server-side, clears the
     cookie, responds `200`.
   - `me` (**new**): protected by `auth.middleware.js`; returns the
     current authenticated user (fetched via the existing user repository,
     sanitized) — this is this feature's equivalent of Feature 3's
     `/ready` and Feature 2's `/health`: the smallest possible proof the
     whole new chain (token issued → sent → verified → identity
     recovered) actually works.

10. **Update `src/modules/auth/auth.routes.js`** — add `POST /refresh`,
    `POST /logout`, and `GET /me` (wired through `auth.middleware.js`).

11. **Update `src/app.js`**:
    - Add `cookie-parser` middleware.
    - Update `cors()` to `{ origin: env.CORS_ORIGIN, credentials: true }`
      — required for the browser to send/receive the httpOnly cookie
      cross-origin.

12. **Manual verification**:
    - Register/login → response contains an `accessToken` in the body and
      confirms (via response headers) a `Set-Cookie` for the refresh
      token, httpOnly/Secure/SameSite flags present.
    - `GET /auth/me` with a valid access token → `200`, correct user.
    - `GET /auth/me` with no token / a garbage token → `401`.
    - `POST /auth/refresh` with the cookie from login → `200`, a new
      access token, and a rotated `Set-Cookie`.
    - Re-using the **old**, now-rotated-out refresh token → rejected
      (proves rotation/revocation actually works, not just issuance).
    - `POST /auth/logout` → subsequent refresh attempts with that token
      fail.
    - Confirm the stored `tokenHash` in the database is a hash, not the
      raw token (same throwaway-script approach as Features 3 and 6).
    - Confirm no raw JWTs or secrets appear in `logs/*.log`.

13. **Run `npm run lint` and `npm run format:check`.**

14. **Update `CLAUDE.md`** — check off "JWT Access + Refresh Tokens."

15. **Write the next handbook chapter**
    (`handbook/07-jwt-access-refresh-tokens.md`) automatically, per your
    standing instruction.

## Explicitly out of scope (deferred to later features)

- RBAC enforcement (checking `role` to authorize specific actions) — this
  feature only establishes identity (`req.user`), not permissions.
- Reuse-detection escalation (revoking an entire "token family" if a
  rotated-out refresh token is replayed) — basic single-token revocation
  is implemented; full family-based theft detection is a further
  enhancement worth naming, not building now.
- Rate limiting on `/login`/`/refresh` — still an acknowledged gap from
  Feature 6, not addressed here either.
