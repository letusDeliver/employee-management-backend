# Chapter 7: JWT Access + Refresh Tokens

## 1. Introduction

This feature makes `/login` and `/register` issue real JWT access and
refresh tokens, adds a database-backed refresh-token table with rotation
and revocation, an `auth.middleware.js` that protects routes by verifying
the access token, and three new endpoints (`/refresh`, `/logout`, `/me`)
that prove the whole chain works end to end.

It exists because Chapter 6 deliberately stopped short of issuing any
session — `/login` just verified credentials and returned a sanitized
user object. This is the feature that turns "verified credentials" into
"an authenticated session the rest of the API can trust."

In the architecture, `src/utils/jwt.js` is a file that's been reserved by
name since the very first architecture discussion, before any code
existed — this chapter is where it finally gets built.

---

## 2. Theory

**What a JWT actually is**: three base64url-encoded segments —
`Header.Payload.Signature`. The signature is an HMAC over the header and
payload, computed with a secret only the server knows; verifying a token
means recomputing that signature and checking it matches — **no database
lookup required**. This is the core property that makes JWTs useful:
**stateless authentication**.

**A detail that's easy to get wrong**: JWTs are encoded, not encrypted.
Anyone holding a token can decode and read its payload — they just can't
forge a valid _signature_ without the secret. The payload here is
deliberately minimal: `{ sub: user.id, role: user.role }` — never email,
name, or anything else, since it's readable by anyone in possession of the
token.

**Why two tokens**: the access token is short-lived (`15m`), sent on every
request, verified purely by signature+expiry. The refresh token is
long-lived (`7d`), used only to mint a new access token. Short access-
token lifetime limits the damage window if one leaks; the refresh token's
longer lifetime is what makes that damage-window limit tolerable without
forcing constant re-logins.

**The stateless/stateful hybrid, and why**: a purely signature-verified
token can't be revoked before it naturally expires — there's no database
record to delete. Fine for a 15-minute access token. Not fine for a 7-day
refresh token — you need the ability to log a user out, or respond to a
suspected compromise. The fix: keep the access token purely stateless
(cheap to verify on every request), but track refresh tokens in a
database table, **hashed** (SHA-256, not bcrypt — a refresh token is
already high-entropy random data with no realistic brute-force-guessing
concern, unlike a human-chosen password; a fast hash is not just
acceptable here, it's the correct, deliberate choice, since verification
happens on every refresh request).

**Refresh token rotation**: every time a refresh token is used, the old
one is revoked and a new one is issued. If a stolen-but-unused refresh
token is ever replayed after its legitimate owner has already rotated past
it, that replay attempt fails — a meaningful security property beyond
simple "it eventually expires."

---

## 3. Architecture

### Token Issuance Flow — Register/Login

```
POST /auth/login (or /register)
    ↓
auth.service.login/register(...)
    ↓
issueTokenPair(user)
    ├─ jwt.signAccessToken({ sub, role })   → accessToken (15m)
    ├─ jwt.signRefreshToken({ sub, role })  → refreshToken (7d)
    └─ refreshTokenRepository.create({
         tokenHash: sha256(refreshToken),
         userId, expiresAt (from token's own exp claim)
       })
    ↓
controller: res.cookie('refreshToken', refreshToken, {...})
            res.json({ message, user, accessToken })
```

### Refresh Flow (with Rotation)

```
POST /auth/refresh   (refreshToken cookie sent automatically)
    ↓
jwt.verifyRefreshToken(refreshToken)   — signature + expiry check
    ↓
refreshTokenRepository.findValidByHash(sha256(refreshToken))
    │
    ├─ not found / revoked / expired → 401 Invalid refresh token
    │
    └─ found → refreshTokenRepository.revoke(oldRecord.id)   [rotation]
                → userRepository.findById(payload.sub)
                → issueTokenPair(user)   [new access + refresh token pair]
                → res.cookie(...) with the NEW refresh token
                → res.json({ accessToken })
```

### Protected Route Flow — `GET /auth/me`

```
GET /auth/me
Authorization: Bearer <accessToken>
    ↓
auth.middleware.js
    ├─ no header / no "Bearer " prefix → 401 Authentication required
    ├─ jwt.verifyAccessToken(token) throws → 401 Invalid or expired token
    └─ succeeds → req.user = { id: payload.sub, role: payload.role }
    ↓
auth.controller.me → authService.getCurrentUser(req.user.id)
    ↓
200 { user }
```

### Layer Responsibilities

| Layer      | File                         | Responsibility                                           | Must NOT do                                                 |
| ---------- | ---------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Utility    | `utils/jwt.js`               | Sign/verify/decode both token types                      | Know about HTTP, cookies, or the database                   |
| Middleware | `auth.middleware.js`         | Verify access token, attach `req.user`                   | Touch the database (stateless by design)                    |
| Repository | `refreshToken.repository.js` | Prisma queries on `RefreshToken`                         | Contain rotation/revocation _decisions_ — just execute them |
| Service    | `auth.service.js`            | Issue, verify, rotate, revoke — all the actual decisions | Touch `req`/`res`, set cookies                              |
| Controller | `auth.controller.js`         | Read/write the refresh-token cookie, shape responses     | Verify tokens or make business decisions itself             |

### Where This Sits in the Full Clean Architecture

```
HTTP Request
    ↓
Route            ← auth.routes.js: /refresh, /logout, /me (NEW)
    ↓
Middleware chain ← + auth.middleware.js (NEW) — protects /me
    ↓
Controller       ← auth.controller.js (MODIFIED — cookies, token responses)
    ↓
Service          ← auth.service.js (MODIFIED — token issuance/rotation)
    ↓
Repository       ← refreshToken.repository.js (NEW) + user.repository.js (unchanged)
    ↓
PostgreSQL       ← RefreshToken table (NEW)
```

---

## 4. Folder Structure

```
src/
├── utils/
│   └── jwt.js                        (NEW) — reserved since Feature 1
├── middlewares/
│   └── auth.middleware.js            (NEW)
├── config/
│   └── env.js                        (MODIFIED) — JWT secrets/expiry added
└── modules/
    └── auth/
        ├── refreshToken.repository.js  (NEW)
        ├── auth.service.js             (MODIFIED)
        ├── auth.controller.js          (MODIFIED)
        ├── auth.routes.js              (MODIFIED)
        └── auth.validation.js          (unchanged)

prisma/schema.prisma                  (MODIFIED) — RefreshToken model + User back-relation
```

---

## 5. File-by-File Explanation

### `src/utils/jwt.js`

```js
import jwt from 'jsonwebtoken';

import env from '../config/env.js';

const signAccessToken = (payload) => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN });
};

const signRefreshToken = (payload) => {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN });
};

const verifyAccessToken = (token) => jwt.verify(token, env.JWT_ACCESS_SECRET);
const verifyRefreshToken = (token) => jwt.verify(token, env.JWT_REFRESH_SECRET);
const decode = (token) => jwt.decode(token);

export default { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, decode };
```

- **Responsibility**: the only file that imports `jsonwebtoken` directly —
  same centralization pattern as `@prisma/client` in `database.js` and
  `winston` in `logger.js`.
- **`decode` is exposed too**, not just `verify`: used by the service to
  read a freshly-signed refresh token's own `exp` claim (to compute the
  database record's `expiresAt`) and by the controller (to compute the
  cookie's `maxAge`) — both without a second, separately-computed
  expiration value that could drift from what the token itself actually
  says.
- **Verified before writing**: a scratch script confirmed `sign`/`verify`
  behave as documented, and specifically confirmed the exact error types
  thrown — `TokenExpiredError` for an expired token, `JsonWebTokenError`
  for an invalid signature or malformed token — which is what
  `auth.middleware.js` needs to catch (both are handled generically here,
  but knowing they're distinct types matters if finer-grained handling is
  ever needed).

### `src/config/env.js` (modified)

```js
const envSchema = z
  .object({
    // ...existing fields...
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters long'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  })
  .refine((data) => data.JWT_ACCESS_SECRET !== data.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    path: ['JWT_REFRESH_SECRET'],
  });
```

- **Minimum length enforced, no default, for both secrets**: a secret is
  the entire security boundary for a token type; a missing or trivially
  short secret must fail the app's boot, not silently produce forgeable
  tokens.
- **The `.refine()` cross-field check**: guards against a genuine, easy-
  to-make mistake — reusing one secret for both token types would mean
  compromising either one compromises both.
- **The real secrets didn't exist in `.env` yet** — generated with
  `crypto.randomBytes(48).toString('hex')` and appended directly (with
  explicit permission first). This is treated differently from Chapter
  3's database password: a JWT secret is arbitrary entropy the app itself
  defines meaning for, not an external credential the user chooses — so
  generating it is appropriate, unlike the database password which had to
  come from the user.

### `src/modules/auth/refreshToken.repository.js`

```js
import prisma from '../../config/database.js';

const create = (data) => prisma.refreshToken.create({ data });

const findValidByHash = (tokenHash) =>
  prisma.refreshToken.findFirst({
    where: { tokenHash, revoked: false, expiresAt: { gt: new Date() } },
  });

const revoke = (id) => prisma.refreshToken.update({ where: { id }, data: { revoked: true } });

export default { create, findValidByHash, revoke };
```

- **`findValidByHash` bakes "valid" into the query itself**: not revoked
  _and_ not expired, in one `WHERE` clause — the service never has to
  remember to check both conditions separately after fetching a raw
  record.
- **No business logic here** — deciding _when_ to revoke (rotation, logout)
  is the service's job; this file only executes whatever the service
  decides.

### `src/modules/auth/auth.service.js` (modified)

```js
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const issueTokenPair = async (user) => {
  const payload = { sub: user.id, role: user.role };
  const accessToken = jwt.signAccessToken(payload);
  const refreshToken = jwt.signRefreshToken(payload);
  const { exp } = jwt.decode(refreshToken);

  await refreshTokenRepository.create({
    tokenHash: hashToken(refreshToken),
    userId: user.id,
    expiresAt: new Date(exp * 1000),
  });

  return { accessToken, refreshToken };
};
```

- **`register`/`login` now call `issueTokenPair` after their existing
  verification logic** and return `{ user, accessToken, refreshToken }` —
  the refresh token leaves the service as data, but the _controller_ is
  what decides it only ever becomes a cookie, never JSON body content.
- **`refresh(refreshToken)`** verifies the JWT, looks up its hash, and — if
  valid — **revokes the old DB record before issuing a new pair**. This
  revoke-then-reissue order is the rotation itself.
- **A real gap this feature surfaced, honestly documented rather than
  silently fixed**: `register` performs `userRepository.create(...)` and
  then `issueTokenPair(user)` as two separate, non-transactional steps. A
  crash between them (which actually happened during this feature's own
  verification — see section 6) leaves a real user account created with
  no session ever issued. Wrapping both in a Prisma transaction would
  close this gap, but doing so requires threading a transaction client
  through the repository layer — a real refactor, judged out of scope for
  this feature and flagged as a future hardening item, the same treatment
  given to the still-open rate-limiting gap from Chapter 6.

### `src/middlewares/auth.middleware.js`

```js
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication required'));
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = jwt.verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
};
```

- **Purely stateless**: no database call at all — this is the entire
  point of keeping the access token verification signature-only.
  Verifying an access token costs the same whether the database is
  healthy, slow, or completely down.
- **`req.user` carries only `{ id, role }`** — the minimal payload from
  the token, nothing more; anything else needed about the user (name,
  email) requires an explicit lookup, which is exactly what `/me` does.
- **Interview question**: _"Why doesn't this middleware need to touch the
  database?"_ — Because the access token's signature alone is sufficient
  proof of authenticity; revocation-before-expiry was deliberately pushed
  onto the refresh token instead, precisely so the access-token check —
  which runs on _every single authenticated request_ — stays cheap.

### `src/modules/auth/auth.controller.js` (modified)

```js
const buildCookieOptions = (refreshToken) => {
  const { exp } = jwt.decode(refreshToken);
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: exp * 1000 - Date.now(),
  };
};
```

- **`httpOnly: true`**: the cookie is never readable by JavaScript at all
  — closes off XSS-based token theft entirely for the refresh token,
  exactly the reasoning from the theory discussion.
- **`secure: env.NODE_ENV === 'production'`**: `Secure` cookies are only
  ever sent over HTTPS; hardcoding `true` would silently break the cookie
  in local HTTP development, so it's conditional on environment.
- **`path: '/api/v1/auth'`**: the cookie is only ever sent to auth
  endpoints, not on every single API request — the access token
  (Authorization header) covers everything else, so there's no reason for
  the browser to attach the more sensitive refresh-token cookie anywhere
  broader than where it's actually used.
- **`maxAge` derived from the token's own `exp` claim**, not a separately
  hardcoded duration — guarantees the cookie's lifetime and the token's
  actual validity window can never drift apart.
- **`me` calls `authService.getCurrentUser(req.user.id)`**, not the user
  repository directly — an early draft of this controller imported the
  repository directly, which would have violated the Controller → Service
  → Repository layering; caught and corrected before finalizing.

---

## 6. Request Lifecycle

### Real bugs surfaced during verification (both honestly documented, not

glossed over)

**Bug 1 — the generated Prisma Client didn't know about `RefreshToken`.**
`npx prisma migrate dev --name add_refresh_token_model` applied
successfully, but the very first registration attempt crashed:

```
TypeError: Cannot read properties of undefined (reading 'create')
    at refreshToken.repository.js:4:30
```

`prisma.refreshToken` was `undefined` — the client simply hadn't been
regenerated. This is the second time in this project `migrate dev` has
not reliably triggered `generate` on its own (the first was Chapter 6).
Running `npx prisma generate` explicitly fixed the client on disk — but
the _already-running_ dev server still had the stale client cached in
memory (`nodemon` ignores `node_modules` by default, so it never noticed
the regeneration). The server had to be manually restarted before the fix
actually took effect.

**Bug 2 (a real limitation, not literally fixed) — that crash left a real
user account created with no session.** Tracing the crash: `register`
had already called `userRepository.create(...)` successfully _before_
`issueTokenPair` threw. Registering the same email again correctly
returned `409 Conflict` — proof the account genuinely existed, just
without ever having a token pair issued. This is exactly the transactional
gap named in section 5 — surfaced by an operational mistake, but real and
worth knowing about regardless of what caused it this time.

### The successful flow, traced live

1. `POST /auth/login` → `200`, body contains `accessToken`; response
   headers show `Set-Cookie: refreshToken=...; Max-Age=604799; Path=/api/v1/auth; HttpOnly; SameSite=Lax` (`Secure` absent, correctly, since this is local HTTP development).
2. `GET /auth/me` with `Authorization: Bearer <accessToken>` → `200`,
   correct sanitized user.
3. `GET /auth/me` with no header → `401 Authentication required`.
4. `GET /auth/me` with a garbage token → `401 Invalid or expired token`.
5. `POST /auth/refresh` (cookie attached automatically) → `200`, a **new**
   `accessToken`, and a **different**, rotated `Set-Cookie` value.
6. Re-submitting the **original** (pre-rotation) refresh token →
   `401 Invalid refresh token` — proves rotation actually revokes the old
   token, not just that a new one gets issued alongside it.
7. `POST /auth/logout` → `200`, `Set-Cookie` clears the cookie
   (`Expires=Thu, 01 Jan 1970...`); the just-used refresh token then fails
   on a subsequent refresh attempt.
8. A throwaway script confirmed the database's `tokenHash` values are
   64-character SHA-256 hex digests, never the raw token.
9. `logs/combined.log` was searched for the test password and both JWT
   secret env-var names — none found.

---

## 7. Best Practices

- **Keep access-token verification stateless** — no database call in the
  hot path that runs on every authenticated request.
- **Make refresh tokens revocable** — the one place statefulness earns
  its cost, since refresh operations are far less frequent than regular
  API calls.
- **Rotate on every refresh** — an old, already-used refresh token should
  never work again.
- **Hash tokens before storing them, with a hash appropriate to the
  data**: fast (SHA-256) for already-high-entropy tokens, slow (bcrypt)
  for low-entropy human passwords — using the wrong one in either
  direction is a real mistake (bcrypt for a token would be needless
  overhead; a fast hash for a password would be a security hole).
- **Derive cookie/database expiry from the token's own claims**, not a
  second, independently-computed duration.
- **Scope cookies to the narrowest path that needs them.**

### Security implications, consolidated

- Both JWT secrets are long, random, and required to differ from each
  other, enforced at boot.
- The refresh token is never exposed to JavaScript (httpOnly) and is only
  ever sent to the auth endpoints that need it (scoped path).
- Refresh tokens are hashed at rest — a database breach alone doesn't
  yield usable sessions.
- Rotation means a stolen-but-not-yet-used refresh token becomes useless
  the moment its legitimate owner refreshes first.
- **Known, undemonstrated limitation**: `curl` does not enforce
  `SameSite`/cookie security policy at all — that's a browser-only
  mechanism. Successful `curl`-based verification here proves the server
  logic is correct, but does **not** prove real cross-origin browser
  behavior once an actual frontend exists on a different port. This is
  the same category of honest gap as the Windows `SIGTERM` limitation
  (Chapter 2) and the admin-privilege limitation (Chapter 3).
- **Known, un-closed gap**: `register` isn't transactional; a failure
  between user creation and token issuance leaves a real account with no
  session. Flagged, not fixed, in this feature.

---

## 8. Performance Considerations

- **Access token verification is O(1) and database-free** — this is the
  entire performance argument for JWTs over server-side sessions requiring
  a lookup on every request.
- **Refresh operations are infrequent by design** (once per access-token
  lifetime, e.g., every 15 minutes at most) — the database write on every
  refresh (revoke old + create new) is not a hot-path cost.
- **`crypto.createHash('sha256')` is effectively free** compared to
  bcrypt's deliberate slowness — exactly why it's the right choice for
  tokens instead of passwords.

---

## 9. Common Mistakes

| Mistake                                                                                       | Why it happens                                               | How senior engineers avoid it                                                                                                                                             |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storing refresh tokens in plaintext                                                           | "It's just a token, not a password"                          | Recognize a database breach would hand out live sessions for every stored token's remaining lifetime                                                                      |
| Using bcrypt to hash refresh tokens                                                           | Copy-pasting the password-hashing pattern reflexively        | Understand _why_ bcrypt is slow (defends against brute-forcing low-entropy input) — a high-entropy token has no such attack surface, so a fast hash is correct and faster |
| Forgetting to run `prisma generate` after a schema change, even after `migrate dev` succeeded | Assuming the migration and the client are always in lockstep | Verify by actually invoking a new model's method before trusting the client is current — as this chapter's own bug demonstrates                                           |
| Not restarting the dev server after regenerating the Prisma client                            | Assuming file regeneration alone is enough                   | Remember `nodemon` ignores `node_modules` by default — an already-running process keeps its stale, in-memory import                                                       |
| Never rotating refresh tokens                                                                 | Simpler to implement                                         | A stolen-but-unused refresh token then stays valid for its entire original lifetime, even after the legitimate user has since refreshed                                   |
| Putting the refresh token in `localStorage`                                                   | Simplest to wire up on the frontend                          | Directly readable by any injected script — an httpOnly cookie closes this off entirely                                                                                    |

---

## 10. Interview Preparation

**Q: Why is access-token verification stateless while refresh tokens are
tracked in a database?**

- _Concise answer_: access tokens are verified on every request, so they
  must be cheap (no DB call); refresh tokens are used far less often, so
  the cost of a DB-backed revocation check is acceptable, and revocability
  matters much more for a token that lives for days.
- _Detailed answer_: this is a deliberate hybrid, not an inconsistency.
  Making the access token stateful (a DB lookup per request) would
  undermine the entire reason for choosing a signed token in the first
  place. Making the refresh token stateless would mean an organization
  could never actually log a user out or respond to a compromised token
  before its natural, days-long expiry. The split assigns each concern to
  the token type where it actually matters.
- _What interviewers are evaluating_: understanding that "stateless vs.
  stateful" isn't a single global decision — it's a per-concern trade-off.

**Q: Why hash refresh tokens with SHA-256 instead of bcrypt, given
passwords use bcrypt?**

- _Concise answer_: bcrypt's deliberate slowness defends against brute-
  forcing a low-entropy human password; a refresh token is already
  high-entropy random data, so that defense is unnecessary, and a fast
  hash is both sufficient and faster to verify on every refresh request.
- _Detailed answer_: bcrypt exists specifically because humans choose
  predictable, guessable passwords from a comparatively small effective
  keyspace — the slow hash makes exhaustive guessing expensive. A JWT
  refresh token has effectively no guessable structure; an attacker who
  doesn't already have the token has nothing to brute-force. Using bcrypt
  here would only add latency with no corresponding security benefit.
- _What interviewers are evaluating_: whether "use bcrypt for
  hashing" is understood as a reasoned choice tied to _why_ passwords
  need it, not a rule applied reflexively to anything called a "secret."

**Q: What specifically does refresh token rotation protect against, that
non-rotated refresh tokens don't?**

- _Concise answer_: it limits a stolen refresh token to a single use — the
  moment the legitimate owner refreshes, the stolen copy stops working.
- _Detailed answer_: without rotation, a single leaked refresh token
  remains valid for its entire lifetime (days), regardless of how many
  times the legitimate user has refreshed since. With rotation, each
  refresh invalidates the token that was just used — so a stolen token can
  only ever be used once before either the attacker or the legitimate user
  "wins the race," and if the legitimate user wins it first, the stolen
  copy is already dead.
- _What interviewers are evaluating_: understanding rotation as a
  practical mitigation for a real, specific attack scenario, not just a
  security-sounding feature to include.

---

## 11. Summary

### Key Takeaways

- Stateless access tokens + stateful, hashed, rotating refresh tokens is
  a deliberate hybrid — not indecision between two approaches.
- `utils/jwt.js`, reserved by name since this project's very first
  architecture discussion, is now real.
- Two genuine bugs (stale generated client, un-transactional register)
  were found by testing, not assumed away — both documented honestly.

### Important Terminology

- **Stateless authentication** — verifying a token by signature alone,
  with no database round-trip.
- **Refresh token rotation** — issuing a new refresh token and revoking
  the old one on every use.
- **httpOnly cookie** — a cookie inaccessible to JavaScript, closing off
  XSS-based token theft.

### Design Principles

- Match each token's statefulness to how often it's used and how much
  revocability actually matters for it.
- Hash any stored secret with an algorithm suited to that secret's actual
  entropy — not a one-size-fits-all choice.
- Derive dependent values (cookie `maxAge`, DB `expiresAt`) from a single
  source of truth (the token's own `exp` claim) rather than recomputing
  them independently.

### Best Practices

- Minimal JWT payloads (`sub`, `role` only).
- `Secure` conditional on environment; `SameSite`/`path` scoped
  deliberately.
- Verify a library's exact error types before writing code that needs to
  distinguish or catch them.

---

## 12. Revision Notes (5-minute read)

- `utils/jwt.js`: sign/verify/decode for both token types, `jsonwebtoken`
  usage centralized here only.
- `env.js` gained 4 new required/defaulted JWT config fields, plus a
  cross-field check that the two secrets differ.
- `RefreshToken` model: hashed (SHA-256) `tokenHash`, `revoked` flag,
  `expiresAt` — new migration.
- Refresh tokens rotate on every use: old record revoked, new pair issued.
- `auth.middleware.js`: stateless access-token verification, attaches
  `req.user = { id, role }`.
- New endpoints: `POST /refresh`, `POST /logout`, `GET /me`.
- Refresh token delivered via httpOnly/SameSite=Lax/environment-
  conditional-Secure cookie, scoped to `/api/v1/auth`, never in the JSON
  body.
- Two real bugs found: `migrate dev` not auto-`generate`-ing again (same
  as Chapter 6) plus a stale in-memory client after regenerating on disk
  (needs a server restart, since `nodemon` ignores `node_modules`); and a
  real, un-fixed transactional gap in `register` surfaced by that crash.
- Verified live: token issuance, `/me` (all three cases), refresh
  rotation, old-token rejection, logout revocation, hashed storage
  confirmed, no secrets in logs.
- Known verification limitation: `curl` doesn't enforce `SameSite`/cookie
  policy — real cross-origin browser behavior is unverified until a real
  frontend exists.

---

## 13. One-Line Interview Answers

**Q: Why are access tokens stateless but refresh tokens stateful?**
A: Access tokens are checked on every request and must be cheap; refresh
tokens are used rarely enough that database-backed revocability is worth
the cost.

**Q: Why SHA-256 for refresh tokens instead of bcrypt?**
A: bcrypt's slowness defends against brute-forcing low-entropy passwords;
a refresh token is already high-entropy, so a fast hash is correct and
faster.

**Q: What does refresh token rotation actually prevent?**
A: It limits a stolen refresh token to a single use — the legitimate
owner's next refresh invalidates it.

**Q: Why is the refresh token in an httpOnly cookie instead of the
response body?**
A: httpOnly cookies are never readable by JavaScript, closing off
XSS-based theft entirely — something a body-returned token stored in
`localStorage` can't offer.

**Q: Why does `auth.middleware.js` never touch the database?**
A: Access-token verification runs on every authenticated request, so it
must stay as cheap as possible — that's the entire point of a stateless
token.

---

## 14. Practical Examples From Our Codebase

The crash that revealed the missed `prisma generate`:

```
TypeError: Cannot read properties of undefined (reading 'create')
    at Object.create (.../refreshToken.repository.js:4:30)
    at issueTokenPair (.../auth.service.js:28:32)
```

Verified rotation, live:

```
$ curl -X POST /api/v1/auth/refresh -b cookies.txt
{"accessToken":"..."}          # 200, new access token + rotated cookie

$ curl -X POST /api/v1/auth/refresh -b cookies.txt   # same OLD cookie again
{"status":"error","message":"Invalid refresh token"}   # 401 - rotation confirmed
```

Verified hashed storage:

```
tokenHash: 5deac81004ab9c0aa611... looks like sha256 hex: true revoked: true
tokenHash: 4c03632cfd2357ed2856... looks like sha256 hex: true revoked: false
tokenHash: e83c9f4ec6f07bec567e... looks like sha256 hex: true revoked: true
```

The `Set-Cookie` header from a real login, showing every deliberate flag:

```
Set-Cookie: refreshToken=eyJhbGci...; Max-Age=604799; Path=/api/v1/auth;
Expires=Sat, 11 Jul 2026 14:44:21 GMT; HttpOnly; SameSite=Lax
```

(`Secure` correctly absent here, since this was tested over local HTTP,
not HTTPS — it will be present automatically once `NODE_ENV=production`.)
