# Chapter 10: Employee Search, Pagination, Filtering, Sorting

## 1. Introduction

This feature touches exactly one endpoint — `GET /employees` — and gives
it four combinable capabilities it didn't have since Chapter 9: bounded
pagination, a multi-field search term, exact-match filters, and
client-controlled sorting. No new endpoints, no new permissions, no
schema change. Everything else about the Employee module is untouched.

It exists because Chapter 9's `GET /employees` returned the entire
non-deleted table in one response — an honestly-documented, deliberately
deferred gap from the start, closed here on schedule.

## 2. Theory

**Why `search` has to include the linked `User`'s name/email, not just
`Employee`'s own fields**: `Employee` has no `name` column — it lives on
`User`, joined through the nullable `userId`. Searching only
`department`/`jobTitle` would make "find this person" impossible for any
employee linked to a login account, which is most of the point of a
"search employees" feature. Prisma expresses a relation filter in the
same `where` clause as a plain field filter (`{ user: { name: { contains
} } }`), so this doesn't cost a separate query — one `findMany` call, one
join, done. Records with `userId: null` simply never satisfy the
`user.*` branches, no special-casing needed.

**Filters vs. search — two different mental models, kept separate**:
`department`/`jobTitle`/`managerId` are exact-match filters, ANDed
together (narrowing what's already there). `search` is fuzzy
(case-insensitive `contains`), ORed across four fields (finding
something you don't know the exact value of). Blending the two — making
`department` fuzzy too, say — would make the query's behavior
unpredictable from the outside. Keeping them conceptually distinct keeps
the API's behavior explainable in one sentence per parameter.

**Whitelisting `sortBy`, not accepting any column name**: this was
already a stated principle in Chapter 9's planning — never let a
client-supplied string become a raw Prisma `orderBy`/`where` key. A
`sortBy` value outside `{department, jobTitle, salary, dateOfJoining,
createdAt}` is rejected by Zod before the service or Prisma ever see it,
regardless of whether the column exists.

**Stable sorting is a correctness property, not a nice-to-have**: without
a tiebreaker, a database is free to return rows with a tied `sortBy`
value in _any_ order — including a _different_ order on a repeated,
identical request. For pagination specifically, this can cause a real,
subtle bug: a row can appear twice across two pages, or never appear at
all, purely because the tie-break order shifted between the two
requests. Appending an unconditional `ORDER BY id ASC` (id is always
unique) closes this — verified live by issuing the exact same sorted
request twice and confirming identical row order both times.

**`Promise.all` vs. a `$transaction` for the list+count pair**: a
transaction guarantees the `findMany` and the `count` see an identical
database snapshot, even under concurrent writes between the two calls.
`Promise.all` doesn't guarantee that — but it's cheaper, and for an HR
application (not a financial ledger), a `total` that's off by one row
because of a genuinely concurrent write is an acceptable, explicitly
documented trade-off, not a defect.

## 3. Architecture

### Query Construction — `GET /employees?search=...&department=...&sortBy=...`

```
GET /api/v1/employees?search=Jane&department=Engineering&sortBy=salary&order=desc&page=2&limit=5
    ↓
authMiddleware → requirePermission('employee:read:any')
    ↓ (403 if not granted)
validateMiddleware(listEmployeesQuerySchema, 'query')
    ↓ (400 on bounds/whitelist failure; validated result → req.validatedQuery)
employee.service.listEmployees(req.validatedQuery)
    ├─ buildEmployeeWhere({ search, department, jobTitle, managerId })
    │    where = {
    │      OR: [ {department:{contains}}, {jobTitle:{contains}},
    │            {user:{name:{contains}}}, {user:{email:{contains}}} ],
    │      department: {equals, mode:'insensitive'},   ← from the filter, ANDed
    │    }
    └─ Promise.all([
         employeeRepository.findAll({ where, orderBy:[{salary:'desc'},{id:'asc'}], skip:5, take:5 }),
         employeeRepository.count(where),
       ])
    ↓
200 { employees: [...], pagination: { page:2, limit:5, total, totalPages } }
```

### Layer Responsibilities

| Layer      | File                     | Responsibility                                                                | Must NOT do                                            |
| ---------- | ------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| Middleware | `validate.middleware.js` | Validate/coerce/bound query params, reject anything outside the schema        | Build query logic, know anything about `Employee`      |
| Service    | `employee.service.js`    | Build the `where`/`orderBy` from validated input; run list+count              | Trust unvalidated input, talk to `req`/`res`           |
| Repository | `employee.repository.js` | Apply `where`/`orderBy`/`skip`/`take` to Prisma; always AND `deletedAt: null` | Decide what's filterable/sortable, parse query strings |

## 4. Folder Structure

```
src/
├── middlewares/
│   └── validate.middleware.js       (MODIFIED) — generalized to (schema, target)
└── modules/
    └── employees/
        ├── employee.validation.js   (MODIFIED) — listEmployeesQuerySchema added
        ├── employee.repository.js   (MODIFIED) — findAll() takes params, count() added
        ├── employee.service.js      (MODIFIED) — listEmployees() rebuilt
        ├── employee.controller.js   (MODIFIED) — reads req.validatedQuery
        └── employee.routes.js       (MODIFIED) — query validation wired into GET /
```

No new files this feature — every change is a modification to something
Chapter 9 already built.

## 5. File-by-File Explanation

### `src/middlewares/validate.middleware.js`

```js
const validateMiddleware =
  (schema, target = 'body') =>
  (req, res, next) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) { ... }

    if (target === 'query') {
      req.validatedQuery = result.data;
    } else {
      req[target] = result.data;
    }
    next();
  };
```

- **Generalized without breaking any existing call site**: every prior
  usage (`createEmployeeSchema`, `updateEmployeeSchema`, the auth
  schemas) omits the second argument, defaulting to `'body'` — identical
  behavior to before this feature.
- **A real, verified-not-assumed finding drives the `target === 'query'`
  branch**: `req.query = {...}` throws under Express 5 in this project's
  strict-mode ES modules — `req.query` is a getter-only accessor with no
  setter. Confirmed by writing and running a tiny Express app that tries
  the assignment directly, not by reading documentation or assuming
  parity with `req.body`. This is the same "verify before building"
  discipline that's caught real issues in almost every prior feature
  (Prisma driver adapters, Winston's flush pattern, bcryptjs's API,
  Express 5 itself).

### `src/modules/employees/employee.validation.js` — `listEmployeesQuerySchema`

```js
export const listEmployeesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional().transform((v) => (v === '' ? undefined : v)),
  department: z.string().optional(),
  jobTitle: z.string().optional(),
  managerId: z.string().uuid().optional(),
  sortBy: z.enum([...]).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
```

- **`z.coerce.number()`** — query string values arrive as strings
  (`?page=2` is the string `"2"`); `coerce` converts before the
  `min`/`max`/`int` checks run.
- **The empty-string `.transform()`** — treats `search=` identically to
  omitting `search` entirely, so downstream code (`buildEmployeeWhere`)
  never has to special-case an empty-but-present string.
- **`sortBy`'s `z.enum([...])`** is the actual security boundary here —
  not a convention, a hard rejection of anything not in the list.

### `src/modules/employees/employee.service.js` — `buildEmployeeWhere` / `listEmployees`

```js
const buildEmployeeWhere = ({ search, department, jobTitle, managerId }) => {
  const where = {};
  if (search) {
    where.OR = [
      { department: { contains: search, mode: 'insensitive' } },
      { jobTitle: { contains: search, mode: 'insensitive' } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
      { user: { email: { contains: search, mode: 'insensitive' } } },
    ];
  }
  if (department) where.department = { equals: department, mode: 'insensitive' };
  if (jobTitle) where.jobTitle = { equals: jobTitle, mode: 'insensitive' };
  if (managerId) where.managerId = managerId;
  return where;
};

const listEmployees = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildEmployeeWhere(filters);

  const [employees, total] = await Promise.all([
    employeeRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    employeeRepository.count(where),
  ]);

  return { employees, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};
```

- **The `{ [sortBy]: order }` computed key** is safe specifically
  _because_ `sortBy` already passed through the Zod enum whitelist — by
  the time this line runs, `sortBy` can only ever be one of five known,
  safe strings.
- **The unconditional `{ id: 'asc' }` tiebreaker** is not conditional on
  what `sortBy` is — it's always appended, since `id` is always unique
  regardless of the primary sort column.

### `src/modules/employees/employee.repository.js`

```js
const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.employee.findMany({ where: { ...where, deletedAt: null }, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.employee.count({ where: { ...where, deletedAt: null } });
};
```

- **`deletedAt: null` is merged in here, not by the caller** — same
  repository-owned-invariant pattern as `findById`/`findByUserId` from
  Chapter 9. The service builds `where` from search/filter intent only;
  the repository is the one place that knows "and also, never show
  soft-deleted rows," so that rule can't accidentally be forgotten by a
  future caller.

## 6. Request Lifecycle

Traced live during implementation:

1. `GET /employees` (no params) → `200`, `page: 1`, `limit: 10`, correct
   `total`/`totalPages` for the full non-deleted set.
2. `GET /employees?page=2&limit=3` → the _second_ group of 3, distinct
   from page 1's results.
3. `GET /employees?page=0` and `?limit=0` and `?limit=500` → `400` for
   all three (bounds rejected, not silently clamped).
4. `GET /employees?department=engineering` (wrong case) → still matches
   `"Engineering"` rows (case-insensitive exact filter).
5. `GET /employees?search=` (empty) → identical `total` to no `search` at
   all.
6. Created a fresh `Employee` linked to a `User` named "Docs Example" —
   `GET /employees?search=Docs` matched it via the `user.name` relation
   filter; `GET /employees?search=docs-example` matched the same record
   via `user.email`.
7. `GET /employees?sortBy=salary&order=asc` vs. `...&order=desc` →
   genuinely reversed orderings. The exact same request repeated twice →
   byte-identical row order both times (stability confirmed).
8. `GET /employees?sortBy=notARealColumn` → `400`, never reaches Prisma.
9. As `EMPLOYEE` (no `employee:read:any`) → still `403`, unchanged from
   Chapter 9 — this feature never touched authorization.

## 7. Best Practices

- **Whitelist, never pass through, anything that becomes part of a raw
  query** (`orderBy` column names here; the same principle already
  applied to filterable/sortable fields being planned before any code was
  written).
- **Make sort orders deterministic with an explicit tiebreaker** whenever
  pagination is involved — an unstable sort and pagination combined is a
  correctness bug waiting to surface as "duplicate or missing rows across
  pages," not just a cosmetic ordering quirk.
- **Verify framework behavior directly when it's load-bearing for a
  design decision**, rather than assuming parity between similar-looking
  APIs (`req.body` vs. `req.query`) — this is what caught the Express 5
  getter-only `req.query` issue before it became a runtime crash in real
  code.
- **Document a performance/consistency trade-off explicitly** (the
  `Promise.all` vs. `$transaction` choice) rather than silently picking
  one without recording why — the next person touching this code needs
  to know it was a deliberate choice, not an oversight, if they're ever
  deciding whether to change it.

### Security implications, consolidated

- `sortBy` whitelist is the actual defense against arbitrary-column
  exposure via `orderBy` — not a convention, a hard Zod rejection.
- `limit`'s server-side cap (100) bounds worst-case per-request cost
  regardless of what a client asks for.
- `search`/`department`/`jobTitle` are passed through Prisma's
  parameterized `contains`/`equals` — no raw string concatenation, no
  SQL-injection surface, verified by attempting an injection payload
  directly.

## 8. Performance Considerations

- Two queries per request (`findMany` + `count`), concurrent via
  `Promise.all` — see Section 2's theory for why this, not a
  transaction, is the deliberate choice here.
- `search` performs a sequential scan across four fields including a
  `User` join at this table's current size — a documented future upgrade
  path (`pg_trgm` trigram index) if the table grows large enough for it
  to matter, not a problem today.
- `limit`'s cap (100) is the actual worst-case bound on a single
  request's cost, independent of table size.

## 9. Common Mistakes

| Mistake                                                                                    | Why it happens                                                                     | How senior engineers avoid it                                                                                                                   |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Sorting by a client-supplied column name directly, with no whitelist                       | Feels like unnecessary ceremony for "just an ORDER BY"                             | Recognize that any client-controlled string reaching a query builder is an injection-shaped risk, even without literal SQL string concatenation |
| Pagination with no tiebreaker on ties                                                      | The bug only shows up with duplicate sort values, which small test data rarely has | Always add a unique-column tiebreaker whenever pagination and sorting combine                                                                   |
| Assuming `req.query` can be reassigned like `req.body`                                     | They look like siblings in Express's request object                                | Verify framework internals directly when a design leans on them, rather than assuming symmetry between similar-looking APIs                     |
| Treating an empty query string the same as an absent one without normalizing it explicitly | Looks like the same thing at a glance                                              | Write an explicit transform/check — an empty string is still a _present_, truthy-in-some-contexts value that needs deliberate handling          |
| Reaching for a `$transaction` by default for any multi-query read                          | "Consistency" sounds like it's always worth the cost                               | Weigh the actual consistency requirement against the actual cost for _this_ application — an HR list view isn't a ledger                        |

## 10. Interview Preparation

**Q: Walk through why search needed to join to `User` instead of staying
scoped to `Employee`'s own columns.**

- _Concise answer_: `Employee` has no `name` field — it lives on `User`,
  and most of what "search employees" implies is finding someone by name.
- _Detailed answer_: Prisma expresses this as a relation filter inside
  the same `where` clause (`{ user: { name: { contains } } }`), which
  Postgres executes as a single query with a join, not a second
  round-trip. Records with no linked `User` (`userId: null`) simply never
  satisfy that branch — no special-casing needed, since Prisma's relation
  filters on a null relation just don't match, they don't error.
- _What interviewers are evaluating_: whether the candidate reasons about
  what "search" should mean from the _user's_ perspective (find a
  person) rather than the _schema's_ perspective (query some string
  columns).

**Q: Why does this feature add a secondary `ORDER BY id ASC` to every
query, even ones that don't ask for it?**

- _Concise answer_: without a tiebreaker, rows with an equal `sortBy`
  value can come back in a different order on repeated, identical
  requests — which breaks pagination (a row can appear on two pages, or
  neither).
- _Detailed answer_: SQL doesn't guarantee any particular order among
  rows with a tied `ORDER BY` value unless a further, unique column
  breaks the tie. `id` is the primary key, always unique, so appending it
  guarantees full determinism regardless of what the primary `sortBy`
  column is — verified live by issuing the same sorted request twice and
  confirming identical ordering both times.
- _What interviewers are evaluating_: understanding that "sorted" and
  "deterministically sorted" are different guarantees, and that the gap
  between them becomes a real bug specifically once pagination enters
  the picture.

**Q: Why `Promise.all` instead of a database transaction for the list and
count?**

- _Concise answer_: a transaction guarantees both queries see an
  identical snapshot; `Promise.all` doesn't, but is cheaper, and the
  inconsistency window is an acceptable trade-off for this application.
- _Detailed answer_: under heavy concurrent writes, the `findMany` and
  `count` could theoretically observe slightly different data (a row
  inserted/deleted between the two calls) — for a financial ledger,
  that's unacceptable; for an HR employee list, an off-by-one `total`
  in a rare race is a documented, accepted cost, not a hidden bug.
- _What interviewers are evaluating_: whether the candidate can name the
  actual consistency guarantee being traded away, and judge whether that
  trade fits the specific application, rather than reaching for "more
  consistency is always better."

## 11. Summary

### Key Takeaways

- Whitelisting client-controlled query-builder inputs (`sortBy` here) is
  a security control, not a style preference.
- Pagination and sorting only compose correctly with a deterministic
  tiebreaker.
- Framework internals that a design leans on (`req.query`'s writability)
  are worth verifying directly, not assuming.

### Important Terminology

- **Offset pagination** — `page`/`limit`-based slicing, the choice made
  here over cursor/keyset pagination.
- **Relation filter** — a Prisma `where` clause that reaches across a
  foreign-key relation (`user.name`) in the same query.
- **Tiebreaker sort column** — an additional, unique `ORDER BY` column
  appended after the primary sort to guarantee deterministic ordering.

### Design Principles

- Search answers "find something," filters answer "narrow to exactly
  this" — keep the two mental models distinct in the API's design.
- Any client-supplied string that becomes part of a query's structure
  (not its parameters) must be whitelisted, never passed through.
- Document a chosen consistency/performance trade-off explicitly, so it
  reads as a decision, not an oversight, to the next reader.

### Best Practices

- Server-side hard caps (`limit <= 100`) regardless of what's requested.
- An explicit, unconditional tiebreaker whenever pagination and sorting
  combine.
- Verify framework-level assumptions directly before designing around
  them, especially when a "surely this works like its sibling API"
  assumption is tempting.

## 12. Revision Notes (5-minute read)

- Only `GET /employees` changed — no new endpoints/permissions/schema.
- `validate.middleware.js` generalized to `(schema, target = 'body')`;
  `target: 'query'` writes to `req.validatedQuery`, not `req.query`,
  because `req.query` throws on assignment under Express 5 (verified
  directly).
- `listEmployeesQuerySchema`: `page`/`limit` (bounded, `limit <= 100`),
  `search` (empty string normalized to absent), `department`/`jobTitle`/
  `managerId` (exact filters), `sortBy` (whitelisted enum), `order`
  (`asc`/`desc`).
- `search` matches `Employee.department`/`jobTitle` **and** the linked
  `User.name`/`email` via a relation filter — a confirmed design
  decision, not the simpler Employee-only-fields option.
- Every query gets an unconditional `ORDER BY id ASC` tiebreaker after
  the requested `sortBy`/`order`, for deterministic pagination.
- List + count run via `Promise.all`, not a `$transaction` — a
  documented, deliberate trade-off for this application.
- Verified live: pagination math, bounds rejection, empty-search
  normalization, case-insensitive exact filters, the `User`-join search
  path, sort-order reversal, and repeat-call ordering stability.

## 13. One-Line Interview Answers

**Q: Why does `search` include the linked User's name/email?**
A: `Employee` has no name field of its own — most of what "search
employees" means is finding someone by name, which requires the join.

**Q: Why whitelist `sortBy` instead of accepting any string?**
A: A client-controlled string becoming part of a raw query's structure
(not its parameters) is an injection-shaped risk, regardless of whether
it's literal SQL.

**Q: Why the unconditional `id ASC` secondary sort?**
A: Ties on the primary sort column would otherwise return in
non-deterministic order, breaking pagination across repeated requests.

**Q: Why does `validateMiddleware` write to `req.validatedQuery` instead
of `req.query`?**
A: `req.query` is a getter-only accessor under Express 5 — assigning to
it throws in this project's strict-mode ES modules, confirmed by direct
test.

**Q: Why `Promise.all`, not a transaction, for the list+count pair?**
A: The cheaper option, with a rare, documented, acceptable inconsistency
window — appropriate for an HR list view, not a ledger.

## 14. Practical Examples From Our Codebase

Verified live, in order:

```
$ curl "/api/v1/employees?page=2&limit=3" -H "Authorization: Bearer <ADMIN>"
200 { "employees": [...3 rows...], "pagination": {"page":2,"limit":3,"total":14,"totalPages":5} }

$ curl "/api/v1/employees?page=0" -H "Authorization: Bearer <ADMIN>"
400

$ curl "/api/v1/employees?department=engineering" -H "Authorization: Bearer <ADMIN>"
200 # matches "Engineering" rows despite the case difference

$ curl "/api/v1/employees?search=" -H "Authorization: Bearer <ADMIN>"
200 # identical total to no search param at all

$ curl "/api/v1/employees?search=Docs" -H "Authorization: Bearer <ADMIN>"
200 { "employees": [{ "userId": "<Docs Example's user id>", ... }] }
# matched via the linked User.name, not any Employee field

$ curl "/api/v1/employees?sortBy=salary&order=asc&limit=5" -H "Authorization: Bearer <ADMIN>"
# salaries ascending

$ curl "/api/v1/employees?sortBy=salary&order=desc&limit=5" -H "Authorization: Bearer <ADMIN>"
# salaries descending - confirmed reversed

$ curl "/api/v1/employees?sortBy=notARealColumn" -H "Authorization: Bearer <ADMIN>"
400 # whitelist rejection, never reaches Prisma
```
