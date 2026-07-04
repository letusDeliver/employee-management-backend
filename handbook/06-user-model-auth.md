# Chapter 6: User Model & Auth (Register/Login)

## 1. Introduction

This feature adds the first real Prisma model (`User`), the first generic
request-body validation middleware, and the first complete Clean
Architecture slice — Route → Controller → Service → Repository — built
end to end for two endpoints: `POST /register` and `POST /login`. JWT
issuance is explicitly deferred to the next feature; `/login` here proves
credential verification works correctly and returns a sanitized user
object, no token yet.

It exists because every prior feature was infrastructure — Express
bootstrap, Prisma plumbing, config validation, logging. This is the first
feature with real business logic and the first one where an entire class
of security concerns (password storage, credential verification, user
enumeration) becomes directly relevant.

In the architecture, this is the first feature to actually populate the
Controller/Service/Repository layers our Clean Architecture diagram has
been pointing at since the very first planning discussion.

---

## 2. Theory

**The `User` model and why each field is shaped the way it is**:

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  name      String
  role      Role     @default(EMPLOYEE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum Role {
  ADMIN
  MANAGER
  EMPLOYEE
}
```

- **`id` is a UUID, not an auto-incrementing integer**: a sequential ID
  leaks information — an attacker who knows their own `id` is `42` can
  reasonably guess `41` and `43` exist too. A UUID carries no ordering
  information at all, closing off that enumeration angle before it exists.
- **`role` exists now, even though RBAC enforcement is a future feature**:
  the column is part of the data shape; the _enforcement logic_ (a
  middleware checking it) is what the RBAC feature actually builds. Adding
  the column now, at zero cost, avoids a disruptive migration later.

**Hashing, not encryption**: encryption is reversible given a key;
hashing is one-way by design. The server should never be _able_ to recover
a user's original password — it only ever needs to answer "does this
input match what's stored," which a one-way comparison does perfectly.
bcrypt specifically salts every password automatically (defeating
precomputed rainbow-table attacks) and is deliberately slow via a
configurable cost factor — that slowness is the point: it makes brute-
force cracking expensive even after a database breach, unlike a fast
general-purpose hash like SHA-256.

**Two security patterns that make this feature different from every prior
one**:

- **User enumeration resistance**: if "email not found" and "wrong
  password" produced different error messages, an attacker could
  determine which emails have registered accounts just by attempting
  logins and reading the response. Both cases must return the exact same
  generic message.
- **Timing-attack resistance**: even with an identical _message_, if the
  "not found" path returns instantly while the "wrong password" path takes
  however long bcrypt's comparison takes, an attacker can distinguish the
  two cases by measuring response time. The mitigation: run a **dummy
  bcrypt comparison** even when no user is found, so both paths take
  comparable time.

---

## 3. Architecture

### Request Flow — `POST /register`

```
POST /api/v1/auth/register
    ↓
helmet → cors → morgan → express.json()      (unchanged since Ch. 2)
    ↓
auth.routes.js: validateMiddleware(registerSchema)
    ↓ (req.body is now parsed/coerced, or a BadRequestError already fired)
asyncHandler(auth.controller.register)
    ↓
auth.service.register({ email, password, name })
    ↓
user.repository.findByEmail(email)   → not found, continue
    ↓
bcrypt.hash(password, 10)
    ↓
user.repository.create({ email, password: hash, name })
    ↓
sanitizeUser(user)   ← strips `password` before it ever leaves the service
    ↓
controller: res.status(201).json({ message, user })
```

### Request Flow — `POST /login` (failure paths included)

```
POST /api/v1/auth/login
    ↓
(same middleware chain, validateMiddleware(loginSchema))
    ↓
auth.service.login({ email, password })
    ↓
user.repository.findByEmail(email)
    │
    ├─ not found → bcrypt.compare(password, DUMMY_HASH) [timing safety]
    │                → throw UnauthorizedError('Invalid credentials')
    │
    └─ found → bcrypt.compare(password, user.password)
                 ├─ mismatch → throw UnauthorizedError('Invalid credentials')
                 └─ match    → sanitizeUser(user) → 200 { message, user }
```

Both failure branches throw the **identical** error — this is the
enumeration-safety property, visible directly in the code, not just
described in prose.

### Layer Responsibilities (first time all four are populated)

| Layer      | File                 | Responsibility                                                                          | Must NOT do                                                                                                      |
| ---------- | -------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Route      | `auth.routes.js`     | Wire validation + controller per endpoint                                               | Contain business logic                                                                                           |
| Controller | `auth.controller.js` | Extract `req.body`, call service, shape response                                        | Know about bcrypt, Prisma, or business rules                                                                     |
| Service    | `auth.service.js`    | Business rules: uniqueness, hashing, credential verification, enumeration/timing safety | Touch `req`/`res`, or call Prisma directly                                                                       |
| Repository | `user.repository.js` | Prisma queries only                                                                     | Contain any business rule (e.g., "is this email taken" is the _service's_ interpretation of a repository result) |

### Where This Sits in the Full Clean Architecture

```
HTTP Request
    ↓
Route            ← auth.routes.js (NEW)
    ↓
Middleware chain ← + validateMiddleware (NEW, generic)
    ↓
Controller       ← auth.controller.js (NEW — first real controller)
    ↓
Service          ← auth.service.js (NEW — first real service)
    ↓
Repository       ← user.repository.js (NEW — first real repository)
    ↓
PostgreSQL       ← User table (NEW — first real migration)
```

Every layer in the original architecture diagram is now populated for the
first time.

---

## 4. Folder Structure

```
src/
├── middlewares/
│   └── validate.middleware.js      (NEW) — generic Zod-schema-runner
├── modules/
│   ├── users/
│   │   └── user.repository.js      (NEW) — Prisma queries only
│   └── auth/
│       ├── auth.validation.js      (NEW) — Zod schemas
│       ├── auth.service.js         (NEW) — business logic
│       ├── auth.controller.js      (NEW) — thin HTTP layer
│       └── auth.routes.js          (NEW) — wiring
└── routes/
    └── index.js                     (MODIFIED) — mounts authRouter at /auth

prisma/
├── schema.prisma                    (MODIFIED) — User model + Role enum
└── migrations/
    └── <timestamp>_add_user_model/  (NEW) — first real migration
```

**Why the User repository lives in `modules/users/`, not `modules/auth/`**:
"User" is the data entity — every future feature (RBAC, Employee linking)
will also need to read/write users. "Auth" is a _flow_ (register, login,
eventually password reset) that operates _on_ that entity. Keeping the
repository in `users/` and having `auth.service.js` import it is a
deliberate, expected cross-module dependency — feature-first modules are
organizational boundaries, not isolated microservices.

---

## 5. File-by-File Explanation

### `src/middlewares/validate.middleware.js`

```js
import BadRequestError from '../errors/BadRequestError.js';

const validateMiddleware = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    return next(new BadRequestError(message));
  }

  req.body = result.data;
  next();
};

export default validateMiddleware;
```

- **Responsibility**: a factory — takes any Zod schema, returns Express
  middleware that validates `req.body` against it.
- **Reserved since the original architecture, built only now**: this is
  the first feature with any per-request body to validate; Feature 4's
  Zod usage (`env.js`) validates `process.env` once at boot, a completely
  different mechanism.
- **`req.body = result.data`**: replaces the raw body with the
  **parsed/coerced** version — downstream code (the controller, the
  service) can trust the shape and types are correct, exactly the same
  "validate once at the boundary, trust it everywhere after" principle
  used for environment config.
- **Interview question**: _"Why does this middleware reassign `req.body`
  instead of just calling `next()` after validating?"_ — Reassigning
  means any type coercion Zod performs (not needed here, but relevant for
  schemas that do) actually reaches the controller — validating without
  using the parsed result would mean the "validated" data and the data
  actually used downstream could silently diverge.

### `src/modules/users/user.repository.js`

```js
import prisma from '../../config/database.js';

const findByEmail = (email) => prisma.user.findUnique({ where: { email } });
const findById = (id) => prisma.user.findUnique({ where: { id } });
const create = (data) => prisma.user.create({ data });

export default { findByEmail, findById, create };
```

- **Responsibility**: the only file that runs `prisma.user.*` queries.
- **No business logic whatsoever** — `findByEmail` returning `null` when
  no user exists is not itself an error; it's the _service's_ job to
  decide what "no user found" means in a given context (a 409 during
  registration, a generic 401 during login).
- **Interview question**: _"Why not just call Prisma directly from
  `auth.service.js` — what does this extra layer actually buy you?"_ — If
  the User table's storage ever needs to change (a different ORM, a
  microservice boundary, a cache-aside layer), only this one file changes;
  the service's business rules (uniqueness, hashing, enumeration-safety)
  stay untouched. It's also what makes the service trivially unit-testable
  later — a fake repository can be substituted with no HTTP or database
  involved.

### `src/modules/auth/auth.validation.js`

```js
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().min(1, 'Name is required'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});
```

- **Registration enforces a minimum length, not a complexity regex**: per
  current NIST 800-63B guidance, forced composition rules (mandatory
  uppercase/digit/symbol) tend to push users toward predictable patterns
  rather than genuinely stronger passwords; a reasonable minimum length is
  the more defensible modern baseline.
- **Login's password rule is deliberately looser** (`min(1)`, just "not
  empty") — login isn't the place to enforce a password _policy_; it just
  needs _something_ to compare. The policy was already enforced once, at
  registration.

### `src/modules/auth/auth.service.js`

```js
import bcrypt from 'bcryptjs';

import userRepository from '../users/user.repository.js';
import ConflictError from '../../errors/ConflictError.js';
import UnauthorizedError from '../../errors/UnauthorizedError.js';

const SALT_ROUNDS = 10;
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-safety', SALT_ROUNDS);

const sanitizeUser = (user) => {
  const { password, ...safeUser } = user;
  return safeUser;
};

const register = async ({ email, password, name }) => {
  const existingUser = await userRepository.findByEmail(email);
  if (existingUser) {
    throw new ConflictError('Email already registered');
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await userRepository.create({ email, password: hashedPassword, name });

  return sanitizeUser(user);
};

const login = async ({ email, password }) => {
  const user = await userRepository.findByEmail(email);

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw new UnauthorizedError('Invalid credentials');
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    throw new UnauthorizedError('Invalid credentials');
  }

  return sanitizeUser(user);
};

export default { register, login };
```

- **`bcryptjs`, not `bcrypt`**: a pure-JavaScript implementation with no
  native compilation step — avoids a real Windows install friction point
  (`node-gyp`, Visual Studio Build Tools). Functionally equivalent
  security; marginally slower than the native binding, judged an
  acceptable trade for this project.
- **`DUMMY_HASH` computed once, at module load, via `hashSync`**: it needs
  to exist before any request arrives, and computing it fresh on every
  failed login would be wasted, repeated work for a value that never
  changes.
- **`sanitizeUser`**: the single place `password` is stripped, used by
  both `register` and `login` — one function, reused, rather than
  duplicating the destructuring in the controller or in each service
  method separately.
- **A small but real ESLint consequence**: `const { password, ...safeUser
} = user` intentionally leaves `password` unused — this is the standard
  "destructure to omit a field" idiom, but our `no-unused-vars` rule
  didn't know to allow it. Fixed by adding `ignoreRestSiblings: true` to
  `eslint.config.js` — a small, well-justified config change, since this
  exact pattern will recur every time a sensitive field needs stripping
  from a future model.
- **Interview question**: _"Walk me through why the `login` function calls
  `bcrypt.compare` even when no user was found."_ — Without it, the "user
  not found" branch returns almost instantly, while the "user found, wrong
  password" branch takes however long a real bcrypt comparison takes. An
  attacker measuring response times could use that timing difference alone
  to determine which emails have registered accounts, even though both
  branches return the identical error message and status code.

### `src/modules/auth/auth.controller.js`

```js
import authService from './auth.service.js';

const register = async (req, res) => {
  const user = await authService.register(req.body);
  res.status(201).json({ message: 'User registered successfully', user });
};

const login = async (req, res) => {
  const user = await authService.login(req.body);
  res.status(200).json({ message: 'Login successful', user });
};

export default { register, login };
```

- **Genuinely thin**: no validation (already done by middleware), no
  password handling, no database access — extract, delegate, shape the
  response. Exactly the Chapter-2 controller contract, now exercised for
  real.
- **`201` for register, `200` for login**: REST convention — `201 Created`
  signals a new resource was created; `200 OK` signals a successful
  operation that didn't create anything new.

### `src/modules/auth/auth.routes.js`

```js
import { Router } from 'express';

import authController from './auth.controller.js';
import { registerSchema, loginSchema } from './auth.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.post('/register', validateMiddleware(registerSchema), asyncHandler(authController.register));
router.post('/login', validateMiddleware(loginSchema), asyncHandler(authController.login));

export default router;
```

- **Middleware order per route**: `validateMiddleware` before the
  controller — the controller must never see an unvalidated body, exactly
  the principle established in the very first architecture discussion.

---

## 6. Request Lifecycle

Traced live during implementation, `POST /api/v1/auth/register`:

1. Body `{ email, password, name }` passes through the standard chain
   (Helmet, CORS, Morgan, `express.json()`).
2. `validateMiddleware(registerSchema)` parses the body; valid input
   passes through with `req.body` replaced by the parsed data.
3. `auth.controller.register` calls `authService.register(req.body)`.
4. `authService.register` calls `userRepository.findByEmail(email)` — no
   existing user found.
5. `bcrypt.hash(password, 10)` produces a salted hash.
6. `userRepository.create(...)` persists the user via Prisma.
7. `sanitizeUser(user)` strips `password`.
8. Controller responds `201` with `{ message, user }`.

Verified live: `201`, response body contained `id` (a UUID), `email`,
`name`, `role: "EMPLOYEE"`, `createdAt`/`updatedAt` — and no `password`
field at all.

The failure paths were equally important to verify:

- Registering the same email again → `409 Conflict`, `"Email already
registered"`.
- Logging in with the correct password → `200`, sanitized user.
- Logging in with the wrong password → `401`, `"Invalid credentials"`.
- Logging in with an email that was never registered → `401`, the
  **exact same** `"Invalid credentials"` — confirming enumeration-safety
  isn't just designed correctly, it behaves correctly.
- Directly inspecting the database (via a throwaway script, not `psql`,
  continuing the pattern from Chapter 3 of never needing the Postgres
  superuser password) confirmed the stored `password` column held a real
  bcrypt hash (`$2b$10$...`), never plaintext.
- Inspecting `logs/combined.log` confirmed no request body — and
  therefore no password, hashed or plaintext — ever appeared in a log
  entry, re-confirming Morgan's no-body-logging behavior specifically now
  that real credentials exist to leak.

---

## 7. Best Practices

- **Hash with bcrypt (or an equivalent slow, salted algorithm) — never a
  fast general-purpose hash, and never encryption.**
- **Identical error message and status for every login failure mode** —
  "user not found" and "wrong password" must be indistinguishable to the
  caller.
- **Match the timing of every failure path**, not just the message — a
  dummy comparison when no user is found closes the timing side-channel
  the message alone doesn't.
- **Strip sensitive fields at the service boundary, once, via a shared
  helper** — not ad hoc in each controller, where it's easy to forget for
  a new endpoint later.
- **Validate shape at the middleware layer, business rules in the
  service** — "is this a valid email" is Zod's job; "is this email already
  registered" needs a database round-trip and belongs in the service.

### Security implications, consolidated

- Passwords are hashed with bcrypt (via `bcryptjs`), salted automatically,
  cost factor 10.
- No endpoint response, ever, includes the `password` field.
- Login is enumeration-safe (identical message) and timing-attack-
  resistant (dummy comparison on the not-found path).
- No request body is ever logged, confirmed specifically with real
  credentials present for the first time.
- Rate limiting on `/login` is **not** implemented yet — flagged
  explicitly as a real gap for a later hardening pass, not silently
  omitted.

---

## 8. Performance Considerations

- **bcrypt's cost factor (10) is a deliberate latency/security trade-off**
  — each hash/compare takes on the order of tens of milliseconds by
  design. This is negligible for a login/register request (which involves
  a network round-trip and a database query anyway) but would be a poor
  choice for anything called at high frequency in a hot path — which is
  exactly why bcrypt is only ever used here, at the auth boundary, not
  anywhere else in the request lifecycle.
- **One database round-trip per registration/login attempt**
  (`findByEmail`) — no N+1 concerns yet since there's no relational data
  being fetched alongside the user.

---

## 9. Common Mistakes

| Mistake                                                                      | Why it happens                                                                                            | How senior engineers avoid it                                                                                                |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Returning different error messages for "user not found" vs. "wrong password" | Feels more "helpful" to the legitimate user who mistyped their email                                      | Recognize that the same information that helps a legitimate user also helps an attacker enumerate accounts                   |
| Skipping the dummy comparison on the not-found path                          | The message is already identical, so it looks sufficiently safe                                           | Understand that timing is itself a side channel independent of the response body                                             |
| Forgetting to strip `password` on some new endpoint later                    | Easy to remember for the two endpoints built today, easy to forget on the fifth endpoint built next month | Centralize the stripping in one reusable function (`sanitizeUser`), used everywhere a `User` record is serialized            |
| Enforcing complex password composition rules                                 | Feels like it's obviously more secure                                                                     | Current guidance favors length over composition; complexity rules often push users toward predictable patterns               |
| Validating "email already exists" in the Zod schema itself                   | Seems like it belongs with the other email validation                                                     | Requires a database call, which doesn't belong in a schema meant to be a fast, synchronous, pure function of the input shape |

---

## 10. Interview Preparation

**Q: Why does this login implementation run a bcrypt comparison even when
no user was found for the given email?**

- _Concise answer_: to prevent a timing-based user-enumeration attack —
  without it, a "user not found" response would be measurably faster than
  a "wrong password" response, leaking which emails have accounts.
- _Detailed answer_: an attacker doesn't need the error _message_ to
  differ to enumerate accounts — a measurable difference in response time
  between "user doesn't exist" (near-instant) and "user exists, password
  wrong" (bcrypt-comparison-time) is enough. Running a dummy comparison
  against a fixed, precomputed hash on the not-found path costs the same
  time as a real comparison, closing that side channel.
- _What interviewers are evaluating_: whether you think about security at
  the level of observable behavior (timing, response shape) rather than
  just "does the error message look safe."

**Q: Why is the User repository separate from the Auth service, given
they're tightly coupled in this feature?**

- _Concise answer_: "User" is a data entity multiple features will need;
  "Auth" is one flow that operates on it. Separating them means the
  storage mechanism can change without touching the business rules, and
  vice versa.
- _Detailed answer_: if the User table's access pattern ever needs to
  change — a different database, a caching layer in front of lookups, a
  read-replica for `findByEmail` — only `user.repository.js` changes.
  `auth.service.js`'s rules (uniqueness checking, hashing, enumeration/
  timing safety) are completely independent of _how_ the data is actually
  fetched or stored, and shouldn't need to change alongside it.
- _What interviewers are evaluating_: understanding that the
  repository/service split isn't arbitrary ceremony — it's about which
  parts of the system are expected to change independently of each other.

**Q: Why hash passwords with bcrypt specifically, instead of a faster hash
like SHA-256?**

- _Concise answer_: password hashing needs to be deliberately _slow_ to
  resist brute-force cracking after a breach; SHA-256 is fast by design,
  which is exactly the wrong property for this use case.
- _Detailed answer_: SHA-256 can be computed billions of times per second
  on modern cracking hardware (GPUs, ASICs), because it's designed for
  throughput (checksums, general hashing). bcrypt's configurable cost
  factor deliberately makes each computation expensive, so even a stolen
  password database is expensive to crack at scale — trading a small,
  one-time cost per legitimate login for a large, repeated cost per
  cracking attempt.
- _What interviewers are evaluating_: understanding _why_ password hashing
  is a specialized problem, not just "hash the password with anything
  called a hash function."

---

## 11. Summary

### Key Takeaways

- This is the first feature to exercise every layer of the Clean
  Architecture stack for real — Route, Controller, Service, Repository.
- Auth-specific security concerns (enumeration-safety, timing-attack
  resistance, never returning sensitive fields) are first-class design
  constraints here, not afterthoughts.
- The User repository/Auth service split establishes the pattern every
  future domain feature (Employee CRUD) will follow.

### Important Terminology

- **User enumeration** — inferring which accounts exist by observing
  differences in error responses or timing.
- **Salt** — random data mixed into a password before hashing, ensuring
  identical passwords produce different hashes.
- **Cost factor** — the configurable "how slow" parameter in bcrypt,
  directly trading computation time for brute-force resistance.

### Design Principles

- Validate shape at the boundary (middleware); validate business rules
  where the data those rules depend on actually lives (the service).
- Strip sensitive fields once, centrally, not ad hoc per endpoint.
- Make every failure path for a security-sensitive operation
  indistinguishable to the caller, in both content and timing.

### Best Practices

- `bcryptjs`/`bcrypt` for password hashing, never a general-purpose hash.
- Identical error message and comparable timing across all login failure
  modes.
- `ignoreRestSiblings: true` for the destructure-to-omit idiom, since it
  will recur.

---

## 12. Revision Notes (5-minute read)

- First real Prisma model: `User` (UUID `id`, unique `email`, hashed
  `password`, `name`, `role` enum defaulting to `EMPLOYEE`).
- First real migration (`add_user_model`) — unlike Feature 3's empty one.
- `bcryptjs` chosen over `bcrypt` for Windows install friction; API
  verified via scratch script before use.
- `src/middlewares/validate.middleware.js` (new) — generic Zod
  request-body validator, reserved since the original architecture.
- `modules/users/user.repository.js` (Prisma only) +
  `modules/auth/{validation,service,controller,routes}.js` (first full
  Clean Architecture slice).
- Login enumeration-safety: identical `401 Invalid credentials` for
  "user not found" and "wrong password."
- Timing-attack mitigation: dummy `bcrypt.compare` on the not-found path.
- `password` stripped via a shared `sanitizeUser` helper — never returned
  in any response.
- JWT issuance deferred to the next feature; `/login` currently returns a
  sanitized user object with no token.
- `eslint.config.js` gained `ignoreRestSiblings: true` for the
  destructure-to-omit-a-field idiom.
- Verified live: register (`201`), duplicate email (`409`), correct login
  (`200`), wrong password and nonexistent email (identical `401`), real
  bcrypt hash confirmed in the database, no passwords in logs.

---

## 13. One-Line Interview Answers

**Q: Why hash passwords instead of encrypting them?**
A: Hashing is one-way by design — the server should never be able to
recover the original password, only verify a match.

**Q: Why does bcrypt deliberately run slowly?**
A: To make brute-force password cracking computationally expensive, even
if the password database is ever stolen.

**Q: Why must "user not found" and "wrong password" return the same error?**
A: Differing messages let an attacker enumerate which emails have
registered accounts.

**Q: Why run a dummy password comparison when no user is found?**
A: To keep response timing consistent across failure modes — otherwise
timing alone leaks which emails exist, even with an identical error
message.

**Q: Why does the User repository live separately from the Auth service?**
A: "User" is a data entity multiple features depend on; "Auth" is one flow
that uses it — separating them lets storage and business rules change
independently.

---

## 14. Practical Examples From Our Codebase

Verified live behavior:

```
$ curl -X POST /api/v1/auth/register -d '{"email":"jane.doe@example.com","password":"supersecret123","name":"Jane Doe"}'
201 { "message": "User registered successfully",
      "user": { "id": "52f83ced-...", "email": "jane.doe@example.com",
                 "name": "Jane Doe", "role": "EMPLOYEE", ... } }
                 # note: no "password" field

$ curl -X POST /api/v1/auth/register -d '{"email":"jane.doe@example.com", ...}'  # same email again
409 { "status": "error", "message": "Email already registered" }

$ curl -X POST /api/v1/auth/login -d '{"email":"jane.doe@example.com","password":"wrongpassword"}'
401 { "status": "error", "message": "Invalid credentials" }

$ curl -X POST /api/v1/auth/login -d '{"email":"nobody@example.com","password":"whatever123"}'
401 { "status": "error", "message": "Invalid credentials" }
# identical status and message to the wrong-password case above
```

Direct database verification (via a throwaway script, not `psql`):

```
Stored password field: $2b$10$3eLt8Je21NCeDbvMmRFLteUsVYgEl70Q009adwYfbh/V.qaA.je4a
Looks like a bcrypt hash: true
```

Log verification — searched `logs/combined.log` for the plaintext
passwords used in every test request above; none were found, confirming
Morgan's no-body-logging behavior holds with real credentials in play.
