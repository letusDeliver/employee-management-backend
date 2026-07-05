# Manual Testing Guide — Full End-to-End Runbook

A single, ordered walkthrough that exercises every endpoint in this API
**and** verifies the resulting database state after each mutating step —
both via a Prisma script (matching this project's own established
verification habit) and the equivalent raw SQL (runnable in `psql` or any
Postgres GUI). This is the interim manual QA process until the
"Testing strategy (unit/integration)" roadmap item lands automated tests —
see `CLAUDE.md`'s Progress Log.

This guide is **complementary** to `handbook/API_ENDPOINTS.md`, not a
replacement for it:

- `API_ENDPOINTS.md` — the deep, per-endpoint reference (every status
  code, security testing, edge cases). Look things up here.
- **This guide** — a sequential script: run it top to bottom in one
  sitting, and at every mutating step, confirm the database actually
  changed the way it should have — not just that the HTTP response looked
  right. Good for a full manual pass before a release, or after any change
  to a service/repository layer.

Every query and response shape in this document was checked against the
real running database and server — not written from memory — following
this project's standing rule (`CLAUDE.md` Rule 17) never to invent
behavior.

---

## 1. Prerequisites

1. PostgreSQL running, migrated, and seeded:
   ```bash
   npx prisma migrate deploy
   npx prisma db seed
   ```
2. Dev server running:
   ```bash
   npm run dev
   ```
3. A way to run the paired database checks — either:
   - **Prisma** (no extra tooling — uses this project's existing
     `src/config/database.js` singleton):
     ```bash
     node -e "import('./src/config/database.js').then(async ({ default: prisma }) => { /* ... */ process.exit(0); });"
     ```
   - **Raw SQL** — `psql` against `DATABASE_URL`, or any GUI (pgAdmin,
     TablePlus, DBeaver). All table/column names below are exact —
     Prisma uses the model names verbatim as table names in this schema
     (no `@@map` overrides), so `model Employee` → table `"Employee"`,
     field `dateOfJoining` → column `"dateOfJoining"`, etc. Postgres
     identifiers are case-sensitive once quoted, so keep the double quotes.

Optional: `ENABLE_SWAGGER=true` in `.env` if you also want to exercise the
Swagger UI steps in §10.

## 2. Conventions Used in This Guide

- `$BASE` = `http://localhost:3000/api/v1` (set `export BASE=http://localhost:3000/api/v1`)
- `$ROOT` = `http://localhost:3000` (set `export ROOT=http://localhost:3000`) — used only for
  `/api-docs`, which is mounted outside the `/api/v1` prefix
- Every step that returns a token/id captures it into a shell variable
  used by later steps — run the blocks **in order**, in the same shell
  session.
- Use a **fresh email per run** (e.g. append a timestamp) so repeated runs
  of this guide don't collide with leftover accounts from a previous pass:
  ```bash
  export TEST_EMAIL="qa-$(date +%s)@example.com"
  ```
- Every "Database Verification" block shows the **Prisma** snippet first,
  then the **raw SQL** equivalent. Both check the same fact — use whichever
  fits your workflow, or both.
- Field extraction from JSON responses uses a small Node helper instead of
  `jq` (not guaranteed to be installed, especially on a fresh Windows
  machine) — Node is already a hard requirement for this project, so this
  keeps the guide runnable with nothing extra installed:
  ```bash
  jsonval() { node -e "
    const d = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
    const v = process.argv[2].split('.').reduce((o, k) => (o == null ? o : o[k]), d);
    console.log(typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : v);
  " "$1" "$2"; }
  # usage: jsonval $TEMP/register.json user.id
  #        jsonval $TEMP/response.json documents.length
  ```
  If you have `jq` installed, `jq -r '.user.id' file.json` works identically.
- **All temp files in this guide use `$TEMP`, not `/tmp`.** Two real,
  Windows/Git-Bash-specific gotchas found by actually running this guide,
  not assumed:
  1. `/tmp/...` only gets translated to a real Windows path by Git Bash's
     MSYS layer when it's a **standalone** shell argument. Embedded inside
     a larger argument — `curl -F "file=@/tmp/x.pdf"`, or inside a
     `node -e "...'/tmp/x.json'..."` script string — it is passed through
     literally, and the receiving native-Windows binary (`curl.exe`,
     `node.exe`) resolves a bare leading `/` as "root of the current
     drive" instead, producing a file-not-found/read error that looks
     unrelated to the real cause. `$TEMP` (Windows' own `%TEMP%`, already
     a full native path like `C:\Users\you\AppData\Local\Temp`) has no
     such ambiguity in either position.
  2. **Never create test files inside the project directory itself.**
     `nodemon` (via `npm run dev`) watches the entire project tree by
     default — dropping a scratch file like `test-doc.pdf` in the repo
     root triggers an unwanted restart mid-test, which silently kills any
     in-flight request (observed live as a confusing `curl` "receive
     error" with no server-side error logged at all). `$TEMP` is outside
     the watched tree, so this can't happen.

## 3. Database Table Reference

| Table | Purpose | Key columns worth watching in this guide |
|---|---|---|
| `User` | Accounts | `password` (bcrypt hash — never appears in any API response or AuditLog snapshot), `profileImageUrl`/`profileImagePublicId` |
| `RefreshToken` | Refresh-token sessions | `tokenHash` (SHA-256 — never the raw token), `revoked`, `expiresAt` |
| `Role` / `Permission` / `UserRole` / `RolePermission` | RBAC | seeded by `prisma/seed.js`; `UserRole` links a `User` to a `Role`, `RolePermission` links a `Role` to a `Permission` |
| `Employee` | HR records | `deletedAt` (soft delete — non-null means invisible to every read path), `salary` (`Decimal` — a **string** in every JSON response) |
| `EmployeeDocument` | Uploaded documents | hard-deleted (no `deletedAt`) — the row is gone after `DELETE`, only the `AuditLog` entry remains |
| `AuditLog` | Mutation history | `beforeData`/`afterData` (`Json?`, full snapshots) — `User`-entity entries must **never** contain `password` |

---

## 4. Health & Readiness

```bash
curl -s -w "\n%{http_code}\n" $BASE/health
curl -s -w "\n%{http_code}\n" $BASE/ready
```

**Expected**: both `200`, `{"status":"ok"}` and
`{"status":"ok","database":"connected"}`.

No database verification needed — `/ready`'s `200` **is** the database
check (a live `SELECT 1`).

---

## 5. Auth: Register, Duplicate, Login, /me

### 5.1 Register

```bash
curl -s -X POST $BASE/auth/register -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"testpass123\",\"name\":\"QA Runner\"}" | tee $TEMP/register.json
export USER_ID=$(jsonval $TEMP/register.json user.id)
export ACCESS_TOKEN=$(jsonval $TEMP/register.json accessToken)
```

**Expected**: `201`, `user.roles` is `["EMPLOYEE"]`, no `password` field
anywhere in the response.

**Database Verification** — a `User` row exists, and it was assigned the
default `EMPLOYEE` role via `UserRole` in the **same transaction** (Feature
9's fix — a user can never exist with zero roles):

```bash
# Prisma
node -e "
import('./src/config/database.js').then(async ({ default: prisma }) => {
  const u = await prisma.user.findUnique({
    where: { email: '$TEST_EMAIL' },
    include: { userRoles: { include: { role: true } } },
  });
  console.log('roles:', u.userRoles.map(r => r.role.name));
  console.log('password is a bcrypt hash, not plaintext:', u.password.startsWith('\$2'));
  process.exit(0);
});
"
```

```sql
-- Raw SQL
SELECT u.email, u.password, r.name AS role
FROM "User" u
JOIN "UserRole" ur ON ur."userId" = u.id
JOIN "Role" r ON r.id = ur."roleId"
WHERE u.email = '<TEST_EMAIL>';
-- expect exactly one row, role = 'EMPLOYEE', password starting with $2 (bcrypt)
```

### 5.2 Duplicate register (expect `409`, no extra row)

```bash
curl -s -w "\n%{http_code}\n" -X POST $BASE/auth/register -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"testpass123\",\"name\":\"QA Runner\"}"
```

**Database Verification** — exactly one `User` row with this email, not two:

```bash
node -e "
import('./src/config/database.js').then(async ({ default: prisma }) => {
  console.log('count:', await prisma.user.count({ where: { email: '$TEST_EMAIL' } }));
  process.exit(0);
});
"
```

```sql
SELECT COUNT(*) FROM "User" WHERE email = '<TEST_EMAIL>'; -- expect 1
```

### 5.3 Login (issues a RefreshToken row)

```bash
curl -s -c $TEMP/cookies.txt -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"testpass123\"}" | tee $TEMP/login.json
export ACCESS_TOKEN=$(jsonval $TEMP/login.json accessToken)
```

**Expected**: `200`, a `refreshToken` cookie set (saved to `$TEMP/cookies.txt`
for the refresh/logout steps below).

**Database Verification** — a new, unrevoked `RefreshToken` row, storing a
**hash**, never the raw token:

```bash
node -e "
import('./src/config/database.js').then(async ({ default: prisma }) => {
  const rt = await prisma.refreshToken.findFirst({
    where: { userId: '$USER_ID' }, orderBy: { createdAt: 'desc' },
  });
  console.log('revoked:', rt.revoked, '| tokenHash length:', rt.tokenHash.length, '| expiresAt:', rt.expiresAt);
  process.exit(0);
});
"
```

```sql
SELECT "revoked", LENGTH("tokenHash") AS hash_len, "expiresAt"
FROM "RefreshToken" WHERE "userId" = '<USER_ID>' ORDER BY "createdAt" DESC LIMIT 1;
-- expect revoked = false, hash_len = 64 (SHA-256 hex)
```

### 5.4 Wrong password (expect `401`, no new RefreshToken)

```bash
curl -s -w "\n%{http_code}\n" -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"wrongpassword\"}"
```

**Database Verification** — `RefreshToken` count for this user is
unchanged from step 5.3 (a failed login never writes a session row):

```sql
SELECT COUNT(*) FROM "RefreshToken" WHERE "userId" = '<USER_ID>';
```

### 5.5 `GET /auth/me`

```bash
curl -s $BASE/auth/me -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Expected**: `200`, always reads fresh from the database (not cached from
the token payload — verified live during Feature 9).

---

## 6. Refresh Rotation & Logout

### 6.1 Refresh (old token is revoked, a new one issued)

```bash
curl -s -b $TEMP/cookies.txt -c $TEMP/cookies.txt -X POST $BASE/auth/refresh | tee $TEMP/refresh.json
export ACCESS_TOKEN=$(jsonval $TEMP/refresh.json accessToken)
```

**Database Verification** — note there are already **two** independent
sessions for this user at this point (one from `register` in §5.1, one
from `login` in §5.3 — each register/login issues its own session, they
don't share one row). Refreshing only rotates the **one cookie you
presented** (the login session): its row flips to `revoked = true`, and a
new row is created with a later `createdAt`. The register session's row
is untouched — still `revoked = false`, since it was never used for
`/auth/refresh`:

```bash
node -e "
import('./src/config/database.js').then(async ({ default: prisma }) => {
  const rows = await prisma.refreshToken.findMany({ where: { userId: '$USER_ID' }, orderBy: { createdAt: 'desc' } });
  console.log(rows.map(r => ({ revoked: r.revoked, createdAt: r.createdAt })));
  process.exit(0);
});
"
```

```sql
SELECT "revoked", "createdAt" FROM "RefreshToken"
WHERE "userId" = '<USER_ID>' ORDER BY "createdAt" DESC;
```

### 6.2 Reuse the now-revoked cookie (expect `401`)

Reusing `$TEMP/cookies.txt` from **before** step 6.1 (i.e. the original
login cookie, not the rotated one) must be rejected:

```bash
curl -s -w "\n%{http_code}\n" -b "refreshToken=<PASTE_THE_OLD_TOKEN_HERE>" -X POST $BASE/auth/refresh
```

### 6.3 Logout

```bash
curl -s -b $TEMP/cookies.txt -X POST $BASE/auth/logout
```

**Database Verification** — only the session you just logged out of (the
most recently-created row, from the §6.1 refresh) is now revoked. The
untouched register-session row from §5.1 is still `revoked = false` —
logout revokes the one presented session, not every session this user
has ever had:

```sql
SELECT "revoked" FROM "RefreshToken"
WHERE "userId" = '<USER_ID>' ORDER BY "createdAt" DESC LIMIT 1; -- expect true
```

---

## 7. RBAC Promotion (manual — no self-service endpoint exists)

Log back in first to get a fresh token (steps 5.3-style), then promote to
`ADMIN` via a direct script — this project has no API for role
assignment by design (see `API_ENDPOINTS.md`'s Known Gaps):

```bash
node -e "
import('./src/config/database.js').then(async ({ default: prisma }) => {
  const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
  await prisma.userRole.create({ data: { userId: '$USER_ID', roleId: adminRole.id } });
  console.log('promoted');
  process.exit(0);
});
"
```

Log in **again** to get a token reflecting the new role (the old token is
stale until re-login — a deliberate, documented consequence of stateless
access tokens):

```bash
curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"testpass123\"}" | tee $TEMP/login2.json
export ACCESS_TOKEN=$(jsonval $TEMP/login2.json accessToken)
```

### `GET /users` (permission-gated)

```bash
curl -s -w "\n%{http_code}\n" $BASE/users -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Expected**: `200` now (was `403` before promotion).

**Database Verification** — the response's `users` array length matches
the real row count:

```bash
node -e "
import('./src/config/database.js').then(async ({ default: prisma }) => {
  console.log('User count:', await prisma.user.count());
  process.exit(0);
});
"
```

```sql
SELECT COUNT(*) FROM "User";
```

---

## 8. Employee CRUD

### 8.1 Create

```bash
curl -s -X POST $BASE/employees -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER_ID\",\"department\":\"Engineering\",\"jobTitle\":\"QA Engineer\",\"salary\":75000,\"dateOfJoining\":\"2024-01-01\"}" \
  | tee $TEMP/employee.json
export EMPLOYEE_ID=$(jsonval $TEMP/employee.json employee.id)
```

**Database Verification** — the `Employee` row exists, **and** exactly
one `AuditLog` row was written in the same transaction (`beforeData` null,
`afterData` populated):

```bash
node -e "
import('./src/config/database.js').then(async ({ default: prisma }) => {
  const e = await prisma.employee.findUnique({ where: { id: '$EMPLOYEE_ID' } });
  console.log('salary is a string:', typeof e.salary.toString() === 'string', e.salary.toString());
  const log = await prisma.auditLog.findFirst({
    where: { entityType: 'Employee', entityId: '$EMPLOYEE_ID' }, orderBy: { createdAt: 'desc' },
  });
  console.log('action:', log.action, '| beforeData null:', log.beforeData === null, '| afterData present:', log.afterData !== null);
  process.exit(0);
});
"
```

```sql
SELECT "action", "beforeData" IS NULL AS before_null, "afterData" IS NOT NULL AS after_present
FROM "AuditLog" WHERE "entityType" = 'Employee' AND "entityId" = '<EMPLOYEE_ID>'
ORDER BY "createdAt" DESC LIMIT 1;
-- expect action = 'CREATE', before_null = true, after_present = true
```

### 8.2 Duplicate `userId` (expect `409`, no new rows at all)

```bash
curl -s -w "\n%{http_code}\n" -X POST $BASE/employees -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER_ID\",\"department\":\"Sales\",\"jobTitle\":\"Rep\",\"salary\":50000,\"dateOfJoining\":\"2024-01-01\"}"
```

**Database Verification** — the rollback must leave **zero** new
`AuditLog` rows, not just zero new `Employee` rows (confirming the
transaction rolled back completely on failure):

```sql
SELECT COUNT(*) FROM "Employee" WHERE "userId" = '<USER_ID>'; -- expect 1
SELECT COUNT(*) FROM "AuditLog" WHERE "entityType" = 'Employee' AND "entityId" = '<EMPLOYEE_ID>'; -- expect 1 (only the CREATE from 8.1)
```

### 8.3 Invalid `managerId` (expect `400`, not a raw `500`)

```bash
curl -s -w "\n%{http_code}\n" -X POST $BASE/employees -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"department\":\"Sales\",\"jobTitle\":\"Rep\",\"salary\":50000,\"dateOfJoining\":\"2024-01-01\",\"managerId\":\"00000000-0000-0000-0000-000000000000\"}"
```

**Expected**: `400` with `message` containing `"managerId: references a
record that does not exist"` — never a raw Prisma `P2003` stack trace.

### 8.4 List (pagination/search/sort cross-check)

```bash
curl -s "$BASE/employees?limit=5&sortBy=createdAt&order=desc" -H "Authorization: Bearer $ACCESS_TOKEN" -o $TEMP/list.json
jsonval $TEMP/list.json pagination
```

**Database Verification** — `pagination.total` matches the real
non-deleted count:

```sql
SELECT COUNT(*) FROM "Employee" WHERE "deletedAt" IS NULL;
```

### 8.5 Update (expect a new `AuditLog` row with both before/after states)

```bash
curl -s -X PATCH $BASE/employees/$EMPLOYEE_ID -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"department":"Platform Engineering"}'
```

```sql
SELECT "action", "beforeData"->>'department' AS before_dept, "afterData"->>'department' AS after_dept
FROM "AuditLog" WHERE "entityType" = 'Employee' AND "entityId" = '<EMPLOYEE_ID>'
ORDER BY "createdAt" DESC LIMIT 1;
-- expect action = 'UPDATE', before_dept = 'Engineering', after_dept = 'Platform Engineering'
```

### 8.6 Self-manager (expect `400`, no audit row written)

```bash
curl -s -w "\n%{http_code}\n" -X PATCH $BASE/employees/$EMPLOYEE_ID -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"managerId\":\"$EMPLOYEE_ID\"}"
```

```sql
-- AuditLog count for this entity should be unchanged from step 8.5 (still 2: CREATE + UPDATE)
SELECT COUNT(*) FROM "AuditLog" WHERE "entityType" = 'Employee' AND "entityId" = '<EMPLOYEE_ID>';
```

### 8.7 Soft delete

```bash
curl -s -X DELETE $BASE/employees/$EMPLOYEE_ID -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Database Verification** — the row still physically exists (soft
delete), `deletedAt` is now set, and it's excluded from every read path:

```bash
node -e "
import('./src/config/database.js').then(async ({ default: prisma }) => {
  const e = await prisma.employee.findUnique({ where: { id: '$EMPLOYEE_ID' } });
  console.log('row still exists:', e !== null, '| deletedAt:', e.deletedAt);
  process.exit(0);
});
"
```

```sql
SELECT "deletedAt" FROM "Employee" WHERE id = '<EMPLOYEE_ID>'; -- expect NOT NULL
```

```bash
# Confirm it's invisible to GET /employees/:id now (expect 404)
curl -s -w "\n%{http_code}\n" $BASE/employees/$EMPLOYEE_ID -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 8.8 Double-delete (expect `404`, not a distinct `409`)

```bash
curl -s -w "\n%{http_code}\n" -X DELETE $BASE/employees/$EMPLOYEE_ID -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 9. Employee Documents

Create a fresh Employee first (the one above is soft-deleted):

```bash
curl -s -X POST $BASE/employees -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"department":"Support","jobTitle":"Specialist","salary":55000,"dateOfJoining":"2024-03-01"}' | tee $TEMP/employee2.json
export EMPLOYEE_ID=$(jsonval $TEMP/employee2.json employee.id)
```

### 9.1 Upload

```bash
echo "test document content" > $TEMP/test-doc.pdf
curl -s -X POST $BASE/employees/$EMPLOYEE_ID/documents -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@$TEMP/test-doc.pdf;type=application/pdf" | tee $TEMP/document.json
export DOCUMENT_ID=$(jsonval $TEMP/document.json document.id)
```

**Database Verification** — the `resourceType` column is populated from
**Cloudinary's own classification**, not defaulted or guessed (the Feature
12 live bug this column exists to prevent):

```bash
node -e "
import('./src/config/database.js').then(async ({ default: prisma }) => {
  const d = await prisma.employeeDocument.findUnique({ where: { id: '$DOCUMENT_ID' } });
  console.log('resourceType:', d.resourceType, '| uploadedBy:', d.uploadedBy);
  process.exit(0);
});
"
```

```sql
SELECT "resourceType", "uploadedBy" FROM "EmployeeDocument" WHERE id = '<DOCUMENT_ID>';
```

### 9.2 Missing file (expect `400`)

```bash
curl -s -w "\n%{http_code}\n" -X POST $BASE/employees/$EMPLOYEE_ID/documents -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 9.3 List

```bash
curl -s $BASE/employees/$EMPLOYEE_ID/documents -H "Authorization: Bearer $ACCESS_TOKEN" -o $TEMP/doclist.json
jsonval $TEMP/doclist.json documents.length
```

```sql
SELECT COUNT(*) FROM "EmployeeDocument" WHERE "employeeId" = '<EMPLOYEE_ID>';
```

### 9.4 Delete (hard delete — row is actually gone, unlike Employee)

```bash
curl -s -X DELETE $BASE/employees/$EMPLOYEE_ID/documents/$DOCUMENT_ID -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Database Verification** — the `EmployeeDocument` row is **physically
removed** (no `deletedAt` column exists on this table — the `AuditLog`
trail is the only history that survives):

```bash
node -e "
import('./src/config/database.js').then(async ({ default: prisma }) => {
  const d = await prisma.employeeDocument.findUnique({ where: { id: '$DOCUMENT_ID' } });
  console.log('row exists after delete:', d !== null, '(expect false)');
  const log = await prisma.auditLog.findFirst({ where: { entityType: 'EmployeeDocument', entityId: '$DOCUMENT_ID' }, orderBy: { createdAt: 'desc' } });
  console.log('audit trail survives:', log !== null, '| action:', log.action);
  process.exit(0);
});
"
```

```sql
SELECT COUNT(*) FROM "EmployeeDocument" WHERE id = '<DOCUMENT_ID>'; -- expect 0
SELECT "action" FROM "AuditLog" WHERE "entityType" = 'EmployeeDocument' AND "entityId" = '<DOCUMENT_ID>'
ORDER BY "createdAt" DESC LIMIT 1; -- expect 'DELETE', row still present
```

Actual Cloudinary-side asset removal is out of scope for a database-only
check — see Feature 12's own live verification (direct CDN fetch + Admin
API) in `handbook/12-file-uploads.md` if you need to re-confirm that.

---

## 10. Profile Picture (self-service, no permission check)

### 10.1 Upload

Cloudinary validates actual image bytes server-side, not just the
declared `Content-Type` — a text file renamed to `.png` gets rejected
**by Cloudinary**, not by this app's own Multer whitelist (see the note
after step 10.2 for what that looks like and why it matters). Use a real,
tiny, valid PNG:

```bash
node -e "
const fs = require('fs');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
fs.writeFileSync(process.env.TEMP + '/avatar.png', png);
"
curl -s -X POST $BASE/users/me/profile-picture -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@$TEMP/avatar.png;type=image/png"
```

**Database Verification** — `User.profileImageUrl`/`profileImagePublicId`
populated, **and** the paired `AuditLog` entry never contains `password` —
the one non-negotiable check for this endpoint (a `User`-entity audit
snapshot must always go through `sanitizeUser()`):

```bash
node -e "
import('./src/config/database.js').then(async ({ default: prisma }) => {
  const u = await prisma.user.findUnique({ where: { id: '$USER_ID' } });
  console.log('profileImageUrl set:', u.profileImageUrl !== null);
  const log = await prisma.auditLog.findFirst({ where: { entityType: 'User', entityId: '$USER_ID' }, orderBy: { createdAt: 'desc' } });
  const snapshot = JSON.stringify(log.afterData);
  console.log('audit snapshot contains password field:', snapshot.includes('password') ? 'FAIL - LEAK' : 'false (correct)');
  process.exit(0);
});
"
```

```sql
SELECT "afterData" ? 'password' AS leaks_password
FROM "AuditLog" WHERE "entityType" = 'User' AND "entityId" = '<USER_ID>'
ORDER BY "createdAt" DESC LIMIT 1; -- expect f (false)
```

### 10.2 Delete

```bash
curl -s -X DELETE $BASE/users/me/profile-picture -H "Authorization: Bearer $ACCESS_TOKEN"
```

```sql
SELECT "profileImageUrl", "profileImagePublicId" FROM "User" WHERE id = '<USER_ID>'; -- expect both NULL
```

### 10.3 Edge case found while writing this guide: valid MIME type, invalid bytes

```bash
echo "not actually a png" > $TEMP/fake.png
curl -s -w "\n%{http_code}\n" -X POST $BASE/users/me/profile-picture -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@$TEMP/fake.png;type=image/png"
```

**Observed (real server, checked while writing this guide)**: `500
{"status":"error","message":"Internal Server Error"}`, with the server
log showing `error: Invalid image file`. Multer's whitelist only checks
the **declared** `Content-Type` header (see `API_ENDPOINTS.md`'s "No
MIME-type sniffing from file content" gap) — it passes this request
through. Cloudinary itself then rejects the actual bytes, and that
specific rejection isn't currently translated into a client-safe `400`
the way a Prisma FK violation or a Multer size-limit error is — it falls
through to the generic, non-operational `500` path instead. Not fixed by
this guide (a documentation task, not a code change) — flagged here as a
concrete, reproducible instance of the already-known MIME-sniffing gap,
for whoever picks up hardening it next.

---

## 11. Swagger / OpenAPI (Feature 13)

### 11.1 Enabled (`ENABLE_SWAGGER=true` in `.env`)

```bash
curl -s -o /dev/null -w "%{http_code}\n" $ROOT/api-docs/   # -> 200
curl -s $ROOT/api-docs.json -o $TEMP/openapi.json
node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync(process.env.TEMP + '/openapi.json','utf8')).paths).length)"  # -> 13
```

### 11.2 Disabled — restart with `ENABLE_SWAGGER=false`

```bash
curl -s -o /dev/null -w "%{http_code}\n" $ROOT/api-docs/   # -> 404, identical shape to any other unmapped route
```

No database verification applies to this section — it's a pure
routing/configuration feature.

---

## 12. Full-Table Sanity Sweep

Run this **before** and **after** a full pass through this guide to get a
before/after row-count snapshot across every table — useful for spotting
an unexpected leak (e.g. a rollback that didn't actually roll back):

```bash
node -e "
import('./src/config/database.js').then(async ({ default: prisma }) => {
  const counts = {
    User: await prisma.user.count(),
    RefreshToken: await prisma.refreshToken.count(),
    Role: await prisma.role.count(),
    Permission: await prisma.permission.count(),
    UserRole: await prisma.userRole.count(),
    RolePermission: await prisma.rolePermission.count(),
    Employee: await prisma.employee.count(),
    EmployeeDocument: await prisma.employeeDocument.count(),
    AuditLog: await prisma.auditLog.count(),
  };
  console.table(counts);
  process.exit(0);
});
"
```

```sql
SELECT 'User' AS table_name, COUNT(*) FROM "User"
UNION ALL SELECT 'RefreshToken', COUNT(*) FROM "RefreshToken"
UNION ALL SELECT 'Role', COUNT(*) FROM "Role"
UNION ALL SELECT 'Permission', COUNT(*) FROM "Permission"
UNION ALL SELECT 'UserRole', COUNT(*) FROM "UserRole"
UNION ALL SELECT 'RolePermission', COUNT(*) FROM "RolePermission"
UNION ALL SELECT 'Employee', COUNT(*) FROM "Employee"
UNION ALL SELECT 'EmployeeDocument', COUNT(*) FROM "EmployeeDocument"
UNION ALL SELECT 'AuditLog', COUNT(*) FROM "AuditLog";
```

`Role`/`Permission`/`RolePermission` should never change across a run
(they're seeded, not created by any endpoint in this API) — if their
counts move, something is wrong.

---

## 13. Cleanup Notes

This guide creates real rows (a `User`, a couple of `Employee` records, an
`EmployeeDocument`, several `AuditLog` entries, `RefreshToken` rows). None
of it is auto-cleaned — consistent with how prior features' live
verification left test accounts in place (`docs-example@example.com`,
`jwt.test@example.com`, etc. are all still in the database from earlier
sessions). If you want a clean slate, delete by the `$TEST_EMAIL` you used
for this run rather than truncating tables wholesale.

## 14. Known Gaps That Affect Testing

- **No automated test suite yet** — this guide *is* the test suite until
  the "Testing strategy" roadmap item lands. Treat every step here as a
  candidate for a future integration test.
- **No rate limiting** — repeated runs of §5's login/register steps won't
  be throttled (a known, already-documented gap, see
  `API_ENDPOINTS.md`'s Known Gaps).
- **Cloudinary steps upload real assets** — §9 and §10 hit the real
  Cloudinary account configured in `.env`. Confirming actual asset
  deletion (not just the database row) requires the direct-CDN-fetch
  technique documented in `handbook/12-file-uploads.md`, not covered here.
- **Concurrency is not exercised by this guide** — every step here is
  sequential; true concurrent-request behavior (e.g. two simultaneous
  profile-picture uploads) is a separately-documented, still-unverified
  gap (see `API_ENDPOINTS.md`).
