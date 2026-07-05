# Feature 11: Audit Logs — Action Plan

Status: **Awaiting review/approval**. Nothing below has been executed yet.

Branch: `feature/11-audit-logs`, off `main`.

## Scope

Adds a durable audit trail for `Employee` mutations only (`create`,
`update`, soft-`delete`) — the exact gap named and deferred since Feature 9. **Write-only**: no `GET /audit-logs` endpoint in this feature (both
confirmed decisions). No changes to `User`/auth flows, no new
permissions, no new routes.

## Confirmed decisions

- **Scope**: `Employee` mutations only. `User`/auth events (register,
  role assignment) are out of scope — role assignment in particular has
  no API endpoint at all today (a direct-database script), so there's no
  natural request-lifecycle hook to attach an audit write to without
  inventing new scope.
- **Write-only**: schema + transactional writes only, no read endpoint.
  A future `GET /audit-logs` (with its own permission and pagination
  questions, much like Feature 10) is a separate, later feature if ever
  needed.
- **Full snapshots, not diffs**, for `beforeData`/`afterData` — simpler,
  and a diff can always be derived later from two full snapshots; a diff
  stored up front would lose information there's no way to recover.
- **No actor-name snapshot** — `actorId` only, resolved against the
  current `User` table if a display name is ever needed. Revisit only if
  a real need for historical name display (surviving a user's own name
  changes) shows up.
- **No `requestId` column yet** — this app has no request-correlation-ID
  middleware today, so the column would sit permanently unpopulated.
  Noted as a clean, additive future migration once request IDs exist —
  not built speculatively now.
- **Action values as constants, not magic strings** — a small
  `AUDIT_ACTIONS`/`AUDIT_ENTITY_TYPES` constants module, so `'CREATE'`/
  `'Employee'` etc. are typo-proof and centralized for when more
  entities/actions are added later.
- **Sensitive-data exclusion**: not needed for `Employee` today (no
  password-like field exists on it — `salary` is exactly the kind of
  data this audit trail is meant to capture, not redact). Explicitly
  noted as a real consideration to revisit if a future entity with
  sensitive fields (e.g. `User`, if ever audited) is added — not solved
  preemptively with unused redaction machinery now.

## A real finding that shapes the implementation

Raw Prisma records contain a `Decimal` (`salary`) and `Date` instances
(`dateOfJoining`, `createdAt`, `updatedAt`) — confirmed live that these
are NOT safe to pass directly into a Prisma `Json` column write. The fix,
verified: normalize via `JSON.parse(JSON.stringify(record))` before
storing as `beforeData`/`afterData` — this converts `Decimal` → string
and `Date` → ISO string, identical to how the API's own JSON responses
already render them (consistent with what a client already sees).

## Actions

1. **Update `prisma/schema.prisma`**:
   - New `AuditLog` model: `id`, `actorId` (nullable, FK → `User.id`,
     `ON DELETE SET NULL` — never cascade-delete audit history),
     `action`, `entityType`, `entityId`, `beforeData`/`afterData` (`Json?`),
     `ipAddress` (nullable), `createdAt`.
   - Indexes: `[entityType, entityId]` (look up a record's full history),
     `[actorId, createdAt]` (look up what a user did recently).
   - `User` gains `auditLogs AuditLog[]`.
   - One migration.

2. **Create `src/modules/audit/auditLog.constants.js`**:

   ```js
   export const AUDIT_ACTIONS = Object.freeze({
     CREATE: 'CREATE',
     UPDATE: 'UPDATE',
     DELETE: 'DELETE',
   });
   export const AUDIT_ENTITY_TYPES = Object.freeze({ EMPLOYEE: 'Employee' });
   ```

3. **Create `src/modules/audit/auditLog.repository.js`**: Prisma-only,
   `create(data, client = prisma)` — same optional-transaction-client
   pattern as `rbac.repository.js`/`user.repository.js`.

4. **Update `src/modules/employees/employee.repository.js`**:
   `create`, `update`, `softDelete` each gain an optional
   `client = prisma` parameter (same pattern), so the service can run
   them inside a transaction.

5. **Update `src/modules/employees/employee.service.js`**:
   - `createEmployee(data, actor)`, `updateEmployee(id, data, actor)`,
     `softDeleteEmployee(id, actor)` — each now takes an `actor: { id,
ipAddress }`.
   - Each wraps its mutation + one `auditLogRepository.create(...)` call
     in a single `prisma.$transaction`. A small shared helper
     (`normalizeForAudit(record)` → `JSON.parse(JSON.stringify(record))`)
     produces the `beforeData`/`afterData` values.
   - `createEmployee`: `beforeData: null`, `afterData:
normalizeForAudit(createdEmployee)`.
   - `updateEmployee`: `beforeData: normalizeForAudit(existingEmployee)`
     (already fetched today, for the existence/self-management check),
     `afterData: normalizeForAudit(updatedEmployee)`.
   - `softDeleteEmployee`: `beforeData: normalizeForAudit(existingEmployee)`,
     `afterData: null`.
   - The existing `P2002`/`P2003` error-translation logic is unaffected —
     a transaction that throws auto-rolls-back in Prisma, so the existing
     `try/catch` around `createEmployee`'s write still works unchanged,
     just now wrapping a transaction instead of a single call.

6. **Update `src/modules/employees/employee.controller.js`**:
   - `create`, `update`, `remove` now build `{ id: req.user.id, ipAddress:
req.ip }` and pass it as the `actor` argument to the corresponding
     service call. `getById`/`list` are unaffected (reads aren't audited).

7. **Manual verification** (live, real data):
   - Create an employee → `201`; confirm exactly one `AuditLog` row
     exists with `action: 'CREATE'`, `entityType: 'Employee'`,
     `entityId` matching the new record, `beforeData: null`,
     `afterData` matching the created record (salary as a string, dates
     as ISO strings), `actorId` matching the caller, `ipAddress` populated.
   - Update that employee → confirm a second `AuditLog` row,
     `action: 'UPDATE'`, `beforeData`/`afterData` correctly reflecting
     the pre/post state.
   - Soft-delete it → confirm a third row, `action: 'DELETE'`,
     `beforeData` populated, `afterData: null`.
   - Force a `409` (duplicate `userId`) and a `400` (self-management,
     invalid FK) → confirm **no** `AuditLog` row is written for a failed
     mutation (the transaction rolled back correctly).
   - Confirm `actorId` correctly survives a hard-deleted `User` as `null`
     — not practically testable today (no user hard-delete path exists),
     so this is verified by schema inspection (`ON DELETE SET NULL`
     confirmed via `pg_indexes`/constraint inspection) rather than a live
     request, and noted honestly as such.
   - `npm run lint` / `npm run format:check` clean.

8. **Update `handbook/API_ENDPOINTS.md`**: add a Database Impact note to
   `POST /employees`, `PATCH /employees/:id`, and `DELETE /employees/:id`
   documenting the new `AuditLog` row each now writes, inside the same
   transaction as the mutation (Rule 17). No endpoint's request/response
   shape changes — this is a backend-only addition, invisible to API
   consumers.

9. **Update root `README.md`** (Rule 16) and `CLAUDE.md`'s Progress Log —
   check off "Audit logs."

10. **Write `handbook/11-audit-logs.md`** per the standing habit.

## Explicitly out of scope

- Any `GET /audit-logs` (or similar) read endpoint — confirmed deferred.
- Auditing `User`/auth events (register, login, role assignment) —
  confirmed deferred; role assignment specifically has no API endpoint
  to hook into today.
- Auditing read (`GET`) operations — not logged, by design, at any
  current or future point unless a specific compliance need for it
  surfaces.
- A `requestId` column — no request-correlation-ID system exists yet in
  this app; adding it now would be an unpopulated, dead column.
- Field-level diffing — full snapshots only, for now.
- Sensitive-field redaction machinery — no field on `Employee` currently
  needs it; revisit if a future audited entity has one.
