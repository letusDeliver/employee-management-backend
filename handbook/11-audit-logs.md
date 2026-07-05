# Chapter 11: Audit Logs

## 1. Introduction

This feature adds a durable audit trail for `Employee` mutations —
`create`, `update`, soft-`delete` — closing a gap named and deliberately
deferred since Chapter 9: "Employee CRUD ships without audit logging for
one feature-cycle... closed immediately next by retrofitting audit-log
calls into the service methods built here." No new endpoints, no new
permissions, no changes to any request/response shape — this is a
backend-only addition, invisible to API consumers.

Two scope questions were explicitly confirmed rather than assumed: audit
only `Employee` mutations (not `User`/auth events — role assignment in
particular has no API endpoint to hook into today), and ship write-only
(no `GET /audit-logs` endpoint yet — a real audit log is often read
directly against the database, and nobody has asked for a viewing UI).

## 2. Theory

**An audit log answers a different question than either application
logs or the data itself.** Winston's logs (Chapter 5) are operational —
requests, errors, startup/shutdown. The `Employee` table itself only
ever shows the _current_ state. An audit log is the third thing: a
durable, append-only record of _who changed what, when_ — which the
other two don't provide together.

**The audit write must be atomic with the mutation it describes, or it's
worthless.** A mutation that succeeds with no matching log entry (or a
log entry for a mutation that failed) defeats the entire purpose. This
is why `createEmployee`/`updateEmployee`/`softDeleteEmployee` — each
previously a single Prisma call — now wrap their mutation and one
`auditLogRepository.create(...)` call in a single `prisma.$transaction`,
following the exact pattern `register()` established in Chapter 9
(repository methods accepting an optional `client = prisma` parameter).

**Full snapshots, not diffs, for `beforeData`/`afterData`.** Storing a
computed diff up front is a one-way door — information not captured
can't be recovered later. A full snapshot is strictly more information;
a diff can always be derived from two snapshots after the fact, whenever
it's actually needed. This is the simpler choice _and_ the more
future-proof one, not a trade-off between them.

**Never cascade-delete audit history.** `AuditLog.actorId → User.id` is
`ON DELETE SET NULL`, not `CASCADE` — if the acting user's account is
ever removed, the log entry must survive; only the actor reference goes
null. This is the same principle already applied to
`Employee.userId`/`managerId` in Chapter 9, extended to a table whose
entire purpose is to survive things.

**A raw Prisma record isn't safe to store directly in a `Json` column.**
`Employee.salary` is a `Decimal` instance; `dateOfJoining`/`createdAt`/
`updatedAt` are `Date` instances. Verified live: passing the raw record
into a Prisma `Json` field write is not something to assume works —
confirmed the safe approach is `JSON.parse(JSON.stringify(record))`
first, which converts `Decimal` → string and `Date` → ISO string, the
same shape the API's own JSON responses already render. This is the same
"verify before relying on it" discipline that's caught real issues in
nearly every prior feature.

## 3. Architecture

### Transactional Write — `POST /employees`

```
POST /api/v1/employees
    ↓
authMiddleware → requirePermission('employee:create')
    ↓ (403 if not granted)
validateMiddleware(createEmployeeSchema)
    ↓ (400 on Zod failure)
employee.service.createEmployee(data, { id: req.user.id, ipAddress: req.ip })
    ├─ userId provided? → employeeRepository.findByUserId → exists? → 409
    └─ prisma.$transaction:
         ├─ employeeRepository.create(data, tx)
         └─ auditLogRepository.create({
              actorId, action: 'CREATE', entityType: 'Employee', entityId,
              beforeData: null, afterData: normalizeForAudit(employee), ipAddress,
            }, tx)
    ↓ (either both succeed, or neither does)
201 { employee }
```

`updateEmployee`/`softDeleteEmployee` follow the identical shape —
`beforeData` for update/delete is the record already fetched for the
existence/self-management check, no extra query needed.

### Layer Responsibilities

| Layer      | File                     | Responsibility                                                      | Must NOT do                                        |
| ---------- | ------------------------ | ------------------------------------------------------------------- | -------------------------------------------------- |
| Service    | `employee.service.js`    | Own the transaction; call the mutation and the audit write together | Talk to `req`/`res`; write audit entries for reads |
| Repository | `auditLog.repository.js` | Prisma-only, accepts an optional transaction client                 | Decide what gets audited or when                   |
| Repository | `employee.repository.js` | Accept an optional transaction client on every mutating method      | Know anything about auditing                       |
| Controller | `employee.controller.js` | Build `{ id: req.user.id, ipAddress: req.ip }` and pass it through  | Build audit log entries itself                     |

## 4. Folder Structure

```
prisma/
├── schema.prisma                (MODIFIED) — AuditLog model; User gains auditLogs[]
└── migrations/.../add_audit_log/

src/
└── modules/
    ├── audit/                   (NEW)
    │   ├── auditLog.constants.js    — AUDIT_ACTIONS, AUDIT_ENTITY_TYPES
    │   └── auditLog.repository.js   — create(data, client = prisma)
    └── employees/
        ├── employee.repository.js  (MODIFIED) — create/update/softDelete take an optional client
        ├── employee.service.js     (MODIFIED) — actor param + $transaction on every mutation
        └── employee.controller.js  (MODIFIED) — passes { id, ipAddress } through
```

## 5. File-by-File Explanation

### `src/modules/audit/auditLog.constants.js`

```js
export const AUDIT_ACTIONS = Object.freeze({
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
});
export const AUDIT_ENTITY_TYPES = Object.freeze({ EMPLOYEE: 'Employee' });
```

- A direct response to a reviewer's suggestion: action/entity-type
  strings as frozen constants, not repeated string literals — typo-proof,
  and centralized for whenever a second entity type is ever audited.

### `src/modules/employees/employee.service.js` — `normalizeForAudit`

```js
const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));
```

- One line, doing real work: `JSON.stringify` calls `.toJSON()` on any
  value that defines it — both Prisma's `Decimal` and JS's `Date` do —
  producing a plain, `Json`-column-safe object. `JSON.parse` turns that
  string back into a plain object (Prisma's `Json` write path wants a
  value, not a string).

### `src/modules/employees/employee.service.js` — `createEmployee` (excerpt)

```js
try {
  return await prisma.$transaction(async (tx) => {
    const employee = await employeeRepository.create(data, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entityId: employee.id,
        beforeData: null,
        afterData: normalizeForAudit(employee),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return employee;
  });
} catch (error) {
  if (error.code === 'P2002') throw new ConflictError(DUPLICATE_USER_MESSAGE);
  rethrowForeignKeyViolationAsBadRequest(error);
}
```

- **The existing `P2002`/`P2003` error-translation logic needed zero
  changes** — a Prisma transaction that throws auto-rolls-back, so
  wrapping the same operations in `$transaction` doesn't change what
  errors surface or how they're caught, only that a second write now
  also participates in the same atomicity.
- **The transaction client (`tx`) is threaded through both calls** — this
  is what makes them atomic; calling `employeeRepository.create(data)`
  (no `tx`) and `auditLogRepository.create({...})` (no `tx`) inside the
  callback would silently run them as two independent, non-atomic writes
  despite appearing to be "inside" a transaction block.

## 6. Request Lifecycle

Traced live during implementation:

1. `POST /employees` (valid body) → `201`; a fresh `AuditLog` row exists:
   `action: 'CREATE'`, `beforeData: null`, `afterData` matching the new
   record (`salary` as a string, dates as ISO strings), `actorId`
   matching the caller, `ipAddress` populated (`::1` for local testing).
2. `PATCH /employees/:id` on that record → a second `AuditLog` row:
   `action: 'UPDATE'`, `beforeData` the pre-change record, `afterData`
   the post-change record — both fields' differences visible directly
   (e.g. `department`/`salary` changed, `updatedAt` changed, everything
   else identical).
3. `DELETE /employees/:id` → a third row: `action: 'DELETE'`,
   `beforeData` populated, `afterData: null`.
4. Forced a `400` (nonexistent `userId`/`managerId`), a `409` (duplicate
   `userId`), and a `400` (self-management) — confirmed via a direct
   `auditLog.count()` before/after that **zero** new rows were written
   for any of the three failures. The count moved by exactly the number
   of _successful_ mutations attempted alongside them, not more.

## 7. Best Practices

- **An audit write is not "fire and forget."** If it can fail
  independently of the mutation it describes, it isn't actually
  guaranteeing anything — the transaction is the feature, not an
  optimization.
- **Store full snapshots, not diffs, when the choice is available.**
  Diffs are a derived, lossy view; snapshots are the source of truth a
  diff can always be computed from later.
- **Verify serialization compatibility with a storage column type
  directly, for any value that isn't a plain string/number/boolean** —
  ORM class instances (`Decimal`, `Date`, and similarly Mongoose
  documents, custom value objects, etc. in other stacks) routinely need
  explicit normalization before a "just store this as JSON" assumption
  holds.
- **Extend an existing pattern instead of inventing a new one** — the
  optional-transaction-client parameter on repository methods, and the
  `$transaction` wrapping in the service, are both directly copied from
  `register()`'s Chapter 9 precedent, not a new design.

### Security implications, consolidated

- `actorId` is always `req.user.id` from the verified access token —
  never client-suppliable.
- `ON DELETE SET NULL` (not `CASCADE`) on `actorId` is itself a security/
  compliance property: an audit trail that could be erased by deleting
  the user who caused it would defeat its own purpose.
- No sensitive-field redaction exists yet because no audited field needs
  it (`Employee` has no password-like column) — explicitly flagged as a
  real, revisit-when-needed concern if a future entity with sensitive
  fields is ever added to the audit scope, not solved with unused
  machinery today.

## 8. Performance Considerations

- One additional `AuditLog` insert per mutating request, inside the same
  transaction as the primary write — a second round-trip cost, traded
  for the atomicity guarantee.
- `[entityType, entityId]` and `[actorId, createdAt]` indexes exist for
  future query patterns ("history of this record," "what did this user
  do recently") even though no endpoint queries them yet — cheap to
  maintain, and the natural indexes for whenever a read path is built.
- No read-path cost today at all — write-only, by confirmed scope.

## 9. Common Mistakes

| Mistake                                                                                               | Why it happens                                                                           | How senior engineers avoid it                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Writing an audit log entry _after_ a mutation commits, as a separate, unguarded step                  | Feels natural to "log it once it's done"                                                 | Recognize that a mutation-without-a-log (or a log-without-a-mutation) both break the audit trail's guarantee; wrap both in one transaction                            |
| Passing a raw ORM record into a JSON/JSONB column without checking how its non-plain fields serialize | JSON.stringify "just works" in a console.log, so it's easy to assume it works everywhere | Verify the specific write path (ORM → column) directly, especially for `Decimal`/`Date`/custom class instances                                                        |
| Storing only a diff, to save space, before there's a proven storage problem                           | Feels like a reasonable optimization up front                                            | Store full snapshots until storage is a demonstrated, not hypothetical, concern — diffs are always derivable later, but never recoverable if not captured             |
| Auditing every operation including reads, "to be thorough"                                            | More logging feels safer                                                                 | Recognize that read-auditing without a specific compliance driver just adds noise and cost; scope audit logging to mutations unless a real requirement says otherwise |
| Expanding scope to "audit everything" in one pass (`User`, auth events, role changes)                 | The schema _could_ support any `entityType`                                              | Scope to the specific, named gap this feature closes; treat other entities as separate, later decisions                                                               |

## 10. Interview Preparation

**Q: Why must the `Employee` mutation and its `AuditLog` entry share one
database transaction?**

- _Concise answer_: without atomicity, a crash between the two writes
  leaves either an unaudited mutation or an orphaned log entry — either
  one defeats the audit trail's purpose.
- _Detailed answer_: this follows the identical reasoning as Chapter 9's
  `register()` fix — a transaction guarantees "both or neither," which
  is exactly the guarantee an audit trail needs to be trustworthy at
  all. The mechanism is the same optional-transaction-client repository
  pattern, reused rather than reinvented.
- _What interviewers are evaluating_: whether the candidate treats audit
  logging as a correctness requirement (needs a transaction) rather than
  an observability nice-to-have (would tolerate best-effort).

**Q: Why store full before/after snapshots instead of a computed diff?**

- _Concise answer_: a snapshot is strictly more information; a diff is
  derivable from two snapshots later, but information never captured
  can't be recovered.
- _Detailed answer_: diffing is also genuinely ambiguous in places (e.g.
  what counts as "changed" for a `null` → `undefined`-shaped absence, or
  nested relations) — deferring that decision to whenever a diff is
  actually consumed avoids committing to a diffing algorithm before
  there's a real reader for it.
- _What interviewers are evaluating_: understanding that "more
  processing up front" isn't automatically better engineering — here,
  the simpler choice is also the more conservative, reversible one.

**Q: What real bug did verifying the `Json` column write path catch?**

- _Concise answer_: a raw Prisma `Employee` record's `salary` (`Decimal`)
  and date fields (`Date` instances) aren't guaranteed-safe to write
  directly into a `Json` column without normalization.
- _Detailed answer_: `JSON.stringify` happens to handle both types
  correctly (they define `.toJSON()`), but that's a property of
  `JSON.stringify` specifically, not something to assume the Prisma
  client's `Json`-field write path replicates identically without
  checking. Verified directly with a real record before writing the real
  `normalizeForAudit` helper.
- _What interviewers are evaluating_: the habit of verifying a specific
  claim (this write path handles this value type) rather than
  generalizing from a similar-but-different one (`JSON.stringify` in a
  console.log).

## 11. Summary

### Key Takeaways

- An audit write is only meaningful if it's atomic with the mutation it
  describes.
- Full snapshots beat diffs as a default — reversible, not lossy.
- ORM class instances need verified, not assumed, JSON-compatibility
  before a "just store this as JSON" plan is safe.

### Important Terminology

- **Audit trail** — a durable, append-only record of who changed what,
  distinct from both operational logs and the data's current state.
- **`ON DELETE SET NULL`** — the FK behavior that lets audit history
  outlive the actor who generated it.
- **Optional transaction client parameter** — the repository pattern
  (`create(data, client = prisma)`) that lets a service run several
  writes atomically without repositories knowing about transactions
  themselves.

### Design Principles

- Scope a feature to the specific, named gap it closes — not to every
  entity the new machinery _could_ apply to.
- Confirm real design/scope decisions explicitly (`Employee`-only,
  write-only) rather than letting them default silently.
- Verify a storage/serialization assumption against the exact write path
  being used, not a similar-looking one.

### Best Practices

- Wrap a mutation and its audit write in one transaction, always.
- Store constants for a finite, known set of string values
  (`action`/`entityType`), not repeated literals.
- Confirm failure paths produce zero audit entries, not just that
  success paths produce the right one.

## 12. Revision Notes (5-minute read)

- New `AuditLog` model: `actorId` (nullable, `ON DELETE SET NULL`),
  `action`/`entityType`/`entityId`, `beforeData`/`afterData` (`Json?`),
  `ipAddress`, `createdAt`; indexed on `[entityType, entityId]` and
  `[actorId, createdAt]`.
- Scope confirmed: `Employee` mutations only; write-only, no read
  endpoint — both explicit decisions, not defaults.
- `employee.repository.js`'s mutating methods and the new
  `auditLog.repository.js` both accept an optional transaction client,
  same pattern as `register()` from Chapter 9.
- `employee.service.js`'s three mutating functions now take an
  `actor: { id, ipAddress }` and wrap mutation + audit write in one
  `prisma.$transaction`.
- A real finding: raw Prisma records (`Decimal`/`Date` fields) need
  `JSON.parse(JSON.stringify(record))` normalization before a `Json`
  column write — verified live, not assumed.
- Verified live: three audit rows (CREATE/UPDATE/DELETE) with correct
  before/after data for one full employee lifecycle; zero audit rows for
  three different forced failures (409, two 400s), confirming
  transactional rollback.

## 13. One-Line Interview Answers

**Q: Why does the audit write need its own transaction with the
mutation?**
A: Without atomicity, a crash between the two leaves either an
unaudited mutation or an orphaned log entry — either breaks the trail.

**Q: Why full snapshots instead of diffs?**
A: Snapshots are strictly more information; a diff is always derivable
later, but nothing uncaptured can be recovered.

**Q: Why `ON DELETE SET NULL`, not `CASCADE`, on `actorId`?**
A: Audit history has to survive even the removal of the person who
caused it — that's the entire point of an audit trail.

**Q: Why does `salary`/`dateOfJoining` need special handling before
writing to the `Json` column?**
A: They're a `Decimal` and `Date` instances, not plain JSON types —
verified live rather than assumed safe.

**Q: Why is this feature scoped to `Employee` only, not also `User`/auth
events?**
A: That's the specific, named gap from Chapter 9; role assignment
specifically has no API endpoint to hook an audit write into today.

## 14. Practical Examples From Our Codebase

Verified live, in order:

```
$ curl -X POST /api/v1/employees -H "Authorization: Bearer <ADMIN>" -d '{...}'
201 {"employee": {...}}
# AuditLog: { action: "CREATE", beforeData: null, afterData: {...salary as string...} }

$ curl -X PATCH /api/v1/employees/<id> -H "Authorization: Bearer <ADMIN>" -d '{"salary":50000}'
200 {"employee": {...}}
# AuditLog: { action: "UPDATE", beforeData: {salary: "45000", ...}, afterData: {salary: "50000", ...} }

$ curl -X DELETE /api/v1/employees/<id> -H "Authorization: Bearer <ADMIN>"
200 {"message": "Employee deleted successfully"}
# AuditLog: { action: "DELETE", beforeData: {...}, afterData: null }

# Forcing failures produces zero new AuditLog rows:
$ curl -X POST /api/v1/employees -d '{"userId":"<already has an active record>", ...}'
409  # no AuditLog row written

$ curl -X PATCH /api/v1/employees/<id> -d '{"managerId":"<same id>"}'
400  # no AuditLog row written
```
