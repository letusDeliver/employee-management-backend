# Feature 10: Employee Search, Pagination, Filtering, Sorting — Action Plan

Status: **Awaiting review/approval**. Nothing below has been executed yet.

Branch: `feature/10-employee-search-pagination-filtering-sorting`, off `main`.

## Scope

Rebuilds `GET /employees` (list only — `GET /employees/:id` is untouched)
to support pagination, a multi-field search term, exact-match filters, and
client-controlled sorting. No new endpoints, no new permissions — still
gated by the existing `employee:read:any` permission.

## Confirmed decisions (from the theory discussion)

- **Search scope**: matches across `Employee.department`, `Employee.jobTitle`,
  and the linked `User.name`/`User.email` (via a relation filter) — not
  just Employee's own fields. Records with `userId: null` simply never
  match the `user.*` branches.
- **Pagination**: offset-based (`page`/`limit`), with a `pagination` block
  in the response (`page`, `limit`, `total`, `totalPages`) — requires a
  paired `count()` alongside `findMany()`.
- **Stable sort**: every query gets a secondary `ORDER BY id ASC` after
  whatever `sortBy`/`order` the client requested, so rows with a tied
  primary sort value always return in the same order across pages/repeats.
- **Explicit bounds**: `page >= 1`, `limit >= 1`, `limit <= 100` — enforced
  by the Zod schema, not just documented.
- **Empty `search=`** is treated identically to an absent `search` — no
  `WHERE` clause contribution, via a Zod `.transform()`.
- **Response shape**: `{ employees: [...], pagination: {...} }`, consistent
  with this API's existing per-endpoint convention (no global response
  wrapper exists in this codebase — see the Global Reference section of
  `handbook/API_ENDPOINTS.md`, which explicitly documents "no blanket
  wrapper" as a deliberate choice, not a gap).
- **Count strategy**: `Promise.all([findMany, count])`, not a `$transaction`
  — a version-skew between the list and the count under heavy concurrent
  writes is an accepted, minor inconsistency for an HR application, and
  `Promise.all` is measurably cheaper. Documented as a conscious choice,
  revisitable if it's ever wrong in practice.

## A real finding that changes the middleware design

`req.query = {...}` **throws** under Express 5 in this project's strict-mode
ES modules — `req.query` is a getter-only accessor with no setter
(confirmed by direct test, not assumed). This means `validateMiddleware`
cannot follow the same pattern for query params that it uses for
`req.body`. Fix: validated/coerced query params are written to a new
`req.validatedQuery` property instead of overwriting `req.query`.

## Actions

1. **Generalize `src/middlewares/validate.middleware.js`**:
   - `validateMiddleware(schema, target = 'body')`.
   - `target === 'body'` (default): unchanged behavior —
     `req.body = result.data`. Every existing call site
     (`createEmployeeSchema`, `updateEmployeeSchema`, auth schemas) is
     unaffected, since the default preserves current behavior exactly.
   - `target === 'query'`: `req.validatedQuery = result.data` (cannot
     write to `req.query` itself — see the finding above).

2. **Add `listEmployeesQuerySchema` to `src/modules/employees/employee.validation.js`**:

   ```
   page:       coerced number, int, min 1, default 1
   limit:      coerced number, int, min 1, max 100, default 10
   search:     optional string, empty string transformed to undefined
   department: optional string
   jobTitle:   optional string
   managerId:  optional UUID
   sortBy:     enum ['department','jobTitle','salary','dateOfJoining','createdAt'], default 'createdAt'
   order:      enum ['asc','desc'], default 'desc'
   ```

3. **Update `src/modules/employees/employee.repository.js`**:
   - `findAll({ where, orderBy, skip, take })` — always ANDs `deletedAt:
null` into `where` internally (repository-owned invariant, same
     pattern already used by `findById`/`findByUserId`), applies the
     given `orderBy`/`skip`/`take`.
   - New `count(where)` — same `deletedAt: null` invariant, no
     pagination/sort args (a count doesn't need them).

4. **Update `src/modules/employees/employee.service.js`**:
   - `listEmployees(query)` replaces the current no-args version:
     - Builds a Prisma `where` from `search` (an `OR` block across
       `department`/`jobTitle`/`user.name`/`user.email`, all
       case-insensitive `contains`) ANDed with exact-match
       `department`/`jobTitle` (case-insensitive `equals`) and
       `managerId` (exact) filters, whichever are present.
     - Builds `orderBy: [{ [sortBy]: order }, { id: 'asc' }]` — the
       trailing `id` tiebreaker is unconditional, regardless of what
       `sortBy` is, since `id` is always unique.
     - Runs `Promise.all([employeeRepository.findAll(...), employeeRepository.count(where)])`.
     - Returns `{ employees, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }`.

5. **Update `src/modules/employees/employee.controller.js`**:
   - `list` reads `req.validatedQuery` (not `req.query`), calls the new
     `listEmployees(query)`, responds `200` with
     `{ employees, pagination }`.

6. **Update `src/modules/employees/employee.routes.js`**:
   - `GET /` gains `validateMiddleware(listEmployeesQuerySchema, 'query')`
     between `requirePermission('employee:read:any')` and the controller.

7. **Manual verification** (live curl, real data):
   - Default call (no query params) → `200`, `page: 1`, `limit: 10`,
     correct `total`/`totalPages`.
   - `limit=1&page=2` → second record, not the first.
   - `limit=500` → clamped to `400` (rejected — exceeds max) or silently
     capped, per whichever the schema does (a `max()` constraint rejects
     with `400`, which is what's planned — confirm this is the intended
     behavior, not a silent clamp, since silently accepting an
     out-of-bounds value and clamping it is a different, also-valid
     design choice worth being explicit about).
   - `page=0`, `limit=0` → `400`.
   - `search=` (empty) → identical result set to no `search` at all.
   - `search=<a linked User's name>` → matches via the `user.name`
     relation filter, proving the join works.
   - `department=engineering` (wrong case) → still matches
     `"Engineering"` records (case-insensitive exact filter).
   - `sortBy=salary&order=asc` then `sortBy=salary&order=desc` → orders
     flip; repeat the same call twice → identical ordering both times
     (stability check).
   - `sortBy=notARealColumn` → `400` (whitelist rejection, not a Prisma
     error).
   - As `EMPLOYEE` (no `employee:read:any`) → still `403`, unchanged from
     Feature 9.
   - Confirm existing `POST`/`GET /:id`/`PATCH`/`DELETE` Employee
     endpoints are unaffected (this feature only touches list).
   - `npm run lint` / `npm run format:check` clean.

8. **Update `handbook/API_ENDPOINTS.md`**: rewrite `GET /employees`'s
   Query Parameters, Successful Response, Postman Test Cases, Negative
   Testing, Edge Cases, and Performance Notes sections to reflect the new
   behavior (Rule 17). Remove it from the "Known, Honestly-Documented
   Gaps" list at the top, since this closes that specific gap.

9. **Update root `README.md`** (Rule 16) and `CLAUDE.md`'s Progress Log —
   check off "Employee search, pagination, filtering, sorting."

10. **Write `handbook/10-employee-search-pagination-filtering-sorting.md`**
    per the standing habit.

## Explicitly out of scope

- Any change to `GET /employees/:id`, `POST`, `PATCH`, `DELETE` — this
  feature only touches the list endpoint.
- Full-text search (Postgres `tsvector`/`pg_trgm`) — `contains` +
  `mode: 'insensitive'` (`ILIKE`) is sufficient at this table's current
  size; a future upgrade path if search performance ever becomes a real
  bottleneck, not before.
- Cursor/keyset pagination — offset pagination remains the right choice
  for this table's size and the "page X of Y" UX it needs to support.
- Any change to `GET /users` (which has the identical no-pagination gap,
  documented since Feature 8) — out of scope for this feature, a
  candidate for its own future pass if ever needed.
