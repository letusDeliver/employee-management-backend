# Frontend Chapter 16 — Performance (reviews with three audiences)

## Theory

**Performance** is the organisation's periodic assessment of each employee. A **review cycle** ("H1 2026")
sets the window; inside it, the employee's manager writes **one review** — a rating and comments; the
employee may add a **self-assessment**, then **acknowledges** it, after which it is history and later
remarks are **notes** (addenda), never edits. It is a personnel record, lighter than a payslip, and reads
nothing from Attendance, Leave or Payroll.

| Aggregate | Shape | Screens |
|---|---|---|
| **Review cycle** | master data, OPEN / CLOSED, a calendar-date range | `/review-cycles` (ADMIN) |
| **Performance review** | a workflow `DRAFT → SUBMITTED → ACKNOWLEDGED` with three audiences: reviewer, reviewed employee, ADMIN | `/performance-reviews`, `/my-reviews`, one review page |
| **Note (addendum)** | append-only child of a review | on the review page |

**The verified contract** (read from `backend/src/modules/{reviewCycles,performance}`, the Prisma models and the
seed, then probed live before any design):

| Fact | Consequence for the UI |
|---|---|
| Cycle names are unique **ignoring case** (409); `end < start` is a 400; a cycle with reviews cannot be deleted (409 "close it instead") | Validation on the END field; the backend's messages shown as they are; closing is the retirement path. |
| A review is created only in an **OPEN** cycle; one per employee per cycle (409) | The new-review dialog offers OPEN cycles only; the duplicate 409 shows inline. |
| MANAGER (`create:reports`) may review only **direct reports**, and is always the reviewer (a `reviewerId` they send is ignored); ADMIN (`create:any`) may review anyone and **must** name a reviewer when the employee has no manager (400) | The picker is narrowed to the manager's reports; ADMIN gets a Reviewer field only when needed. |
| `reviewerId` is **stored at creation** (ADR-PF02); managing needs `manage:any` or `manage:reports` **and** being that stored reviewer | A manager who took over a team later cannot manage their predecessor's drafts — the UI follows. |
| Edit / submit / delete: **DRAFT only**; submit needs a rating **and** comments (400) | One tested rule, `reviewActions`, drives every button. |
| Self-assessment: the reviewed employee, at **any** status before acknowledgement (**including DRAFT**); acknowledge: the employee **only**, SUBMITTED only (no ADMIN override) | Shown to the employee during DRAFT; Acknowledge only once submitted. |
| The API returns a **DRAFT's rating and comments to the reviewed employee** | Hidden on screen until submitted — presentation, **not privacy** (a recorded backend gap). |
| Notes are accepted at **any** status by anyone who can view the review; `authorId` is a **user** id | Offered from SUBMITTED on (a decision, stricter than the server); authors named as each role allows. |
| Department / designation / branch are **recorded at submission** (null while DRAFT) | Shown as "At submission: …" — never today's live values. |
| A MANAGER's unfiltered list = **their own reviews + the ones they write** (no reviewer filter); ADMIN has `read:any` | "My reviews" sends the caller's own employee id; the ledger labels a manager's own row "About you". |
| EMPLOYEE cannot list employees or users; MANAGER cannot list users | EMPLOYEE sees "You" / "Your reviewer" / "Someone else"; MANAGER sees "Designation, Department". Never an id. |
| No "my employee record" endpoint | For a caller who can read only their own reviews, the server's 200 on a review **is** the proof it is theirs. |

## Architecture

```
shared/components/employee-picker     + optional `include` (narrows options; absent = unchanged)  [commit A]

features/performance/
├── data-access/
│   ├── performance.models.ts          wire = model (no Decimals) - no mapper
│   ├── review-rules.ts                RATINGS, statuses, canManage, reviewActions, showManagerContent, canSubmit,
│   │                                  isAboutCaller, cycleDateRange (pure, tested)
│   ├── cycle-form.ts                  only-changed builder, end-not-before-start validator
│   ├── review-context.ts              who the caller is (own employee id), the actor, per-role names
│   ├── review-cycle-lookup.ts         every cycle: names + OPEN options (not MasterDataDirectory - OPEN/CLOSED)
│   ├── review-cycle.service.ts / performance-review.service.ts / performance-http.ts
│   └── review-cycle-list / review-ledger / my-reviews / review-detail stores
├── review-cycle-list/     page + table + dialog
├── review-ledger/         page + table + new-review dialog
├── review-detail/         ONE page for /performance-reviews/:id and /my-reviews/:id
├── my-reviews/            page
└── performance.routes.ts  PERFORMANCE_REVIEW_ROUTES, MY_REVIEW_ROUTES
```

**Decisions, and what was rejected**

1. **One pure rule for every button**: `reviewActions(review, actor)` → `{edit, submit, delete, selfAssess,
   acknowledge, addNote}`, failing closed on anything unknown (an unknown own id manages nothing). Rejected:
   per-template `@if` conditions — the Leave lesson: "may THIS caller do THIS to THIS row" belongs in one tested place.
2. **Who the caller is, without an endpoint for it** (`ReviewContext`): ADMIN/MANAGER resolve their own employee
   from the directory; an EMPLOYEE (only `read:own`) is the subject of any review the server returned to them. A
   MANAGER is deliberately **not** assumed to be the subject of a review they can load — they can load their reports'.
3. **Draft content hidden from its subject**, the self-assessment still open during DRAFT (as the backend allows).
4. **Notes only from SUBMITTED** (the Phase 2 question, approved): during DRAFT the reviewer edits and the employee has
   the self-assessment; notes are for after the fact (§2). The only rule knowingly stricter than the backend.
5. **Cycles are not on `MasterDataStore`**, and their lookup is not a `MasterDataDirectory`: both are typed to
   ACTIVE/INACTIVE, cycles are OPEN/CLOSED with dates. Widening those types for one consumer would touch every
   master-data screen; `createPagedList` + a small lookup cost less. (Phase 1 had said "like Shift" — changed at Phase 2.)
6. **Narrow the shared picker with an optional input** (`include`), its own commit; Attendance and Leave unchanged
   (Leave's 135 live checks re-run).
7. **A MANAGER's own review stays in their ledger, labelled "About you"**, rather than filtered out on the client (that
   would corrupt paging counts) — there is no reviewer filter on the API.
8. **One review page, two routes**; `data.origin` picks the breadcrumb and Back. 403 / 404 / error are separate states.
9. **Every confirm says what its step does**: Submit — "can't be edited afterwards"; Acknowledge — "doesn't mean you
   agree"; Delete draft.

## Folder Structure

See the tree above. `performance.routes.ts` exports two route arrays; `app.routes.ts` has `review-cycles` (flat) and two
wrappers (`performance-reviews`, `my-reviews`) that own the parent crumbs.

## Angular Concepts Used

- **Signals / `computed()`** for the actor, the actions, the content visibility; **`effect()`** to put the SAVED values
  back into the forms after every reload (what is shown is what is stored).
- **Reactive forms**: a cross-field validator placed on the control that shows it; **`FormGroupDirective.resetForm()`**
  (see the bug below).
- **Angular's `RequiredValidator` directive**: `[required]` on an element with `formControlName` adds `Validators.required`
  and removes it when the element is destroyed — so a conditionally rendered required field needs no manual
  `setValidators` (found by a surviving mutant).
- **`ControlValueAccessor` widening**: an `input()` function on the shared picker, read inside its `computed()`.
- **`createPagedList`**, **`createConfirmDelete`** (confirm → request → report for submit / acknowledge / delete),
  **RxJS `expand`/`reduce`** for the every-page cycle lookup.

## Routing

```
/review-cycles                  ReviewCycleListPage      reviewCycle:create
/performance-reviews            ReviewLedgerPage         performanceReview:manage:reports | manage:any
/performance-reviews/:id        ReviewDetailPage         (same)            data.origin = 'manage'
/my-reviews                     MyReviewsPage            performanceReview:read:own
/my-reviews/:id                 ReviewDetailPage         performanceReview:read:own   data.origin = 'mine'
```

## State Management

Every store is provided by its page. The detail store holds one review with separate `notFound` / `forbidden` /
`error`, and **refetches after every action** (statuses, times, the recorded names and notes come from the server);
a 409 refetches too. `ReviewContext` and `ReviewCycleLookup` are root services with no long-lived cache (`load()` /
`refresh()` on entry).

## Best Practices

- Hide what a role should not see yet, and say plainly in the docs when that is presentation, not security.
- Derive "is this mine?" from what the server already proved, never from a guess.
- Read a surviving mutant as "this code may be dead" as well as "a test is missing".
- Reset a submitted form through its directive.
- Every request inline-error, every failure inline.

## Testing

- **943 tests (was 862; 81 new)**: rules for every role and status, the context (own id, the own-only inference, every
  label, never an id), cycle form, services, lookup, all four stores, the review page per role, the new-review dialog
  (narrowing, conditional reviewer, clearing), My reviews (own id / not linked / blocked), the cycle dialog, the ledger
  table, the picker's `include`.
- **Mutation checks: 17, all killed** — the 16 planned (one rebuilt, see below) plus the note-form regression. One
  planned mutant ("never require a reviewer") **survived**: the template's `[required]` binding already made the
  conditional field required, so the manual validator was redundant — removed, and the mutant rebuilt as "never ask
  for a reviewer" (killed). A second candidate ("send a no-longer-needed reviewer") is equivalent by design (two
  independent guards) and was dropped rather than counted.
- **Live**: `verify-performance.mjs`, 63 checks, **two consecutive clean runs on the final code** (ADMIN without / with
  an employee record, MANAGER, EMPLOYEE; cycles CRUD incl. the case-insensitive duplicate and delete-in-use; the whole
  DRAFT → SUBMITTED → ACKNOWLEDGED path with notes; the no-manager reviewer; 403/404; outage; 360 px measured). Leave's
  135 re-run on the picker change.

## Performance Notes

The cycle lookup and the employee directory are loaded once per page visit; names are computed from signals, not
fetched per row.

## Accessibility Notes

Status is a word and an icon; label/value `<dl>`s; the in-flight actions are `role="status"`; icon links carry
`aria-label`s ("Open the review of Asha Rao, H1 2026"); the conditional reviewer hint is `role="status"`.

## Security Notes

The draft-visibility rule is **not** a security control — the API returns draft content to the reviewed employee; that
is a backend gap to fix server-side if it matters. The UI never offers an action the server refuses, and never shows a
"my …" list wider than the caller.

## Real Bugs Found During This Work

1. **The empty note field turned red after every successful note** — found reading the "submitted" screenshot:
   `FormGroup.reset()` clears touched, not the directive's `submitted`, and Material shows an empty, submitted field
   as an error. Fixed with `FormGroupDirective.resetForm()`; a spec that fails on the old code (mutant 17) and a live
   check pin it.
2. **Redundant validator code**, exposed by a surviving mutant (above).
3. **A MANAGER's dialog could have said "Nobody reports to you" while their own record was still loading or had failed**
   — caught while writing the dialog: it now reads the context live and blocks with a Retry on failure.

**Not app bugs**: the Vite `EPERM` blank login page (again, on a fresh cache — `login-ready.mjs` now gates every run);
`<dt>/<dd>` text read as one string (twice, in a spec and the verifier — the Payroll lesson, relearned); a status pill's
icon ligature inside a cell's text; a validator that first runs before its control joins the group; a deleted row's
name still quoted by the closing confirm; a mutation script whose generated strings got real newlines.

## Observations Outside This Work's Scope (not changed)

Backend: a DRAFT's rating and comments are returned to the reviewed employee; there is no reviewer filter on the list;
a review carries no reviewer name and a note no author name (an EMPLOYEE cannot name either); notes are accepted at any
status; lists sort by one key; no "my employee record" endpoint. Frontend: long master-data names make the ledger scroll
under its sticky action column at 1280 px (normal for this table; real names are shorter).

## Interview Questions

1. The API sends a draft's content to the employee it is about. What does hiding it in the UI achieve, and what does it not?
2. An EMPLOYEE cannot learn their own employee id. How can the UI still know they are the subject of a review — and why
   must the same inference NOT be made for a MANAGER?
3. Why is `reviewerId` stored rather than looked up, and what does that mean for a manager who takes over a team?
4. A mutant that removed a validator survived. What two conclusions can a surviving mutant lead to?
5. After a successful submit you reset a form and the empty field shows an error. Why, and what is the fix?

## Key Takeaways

- Three audiences on one record: make "who may do what, and see what" one tested function.
- Let what the server already proved stand in for what it cannot tell you.
- Widen shared components with optional inputs; prove the old consumers unchanged.
- A surviving mutant is evidence — sometimes of dead code.
