# Chapter 12: File Uploads (Multer + Cloudinary)

## 1. Introduction

This feature adds two upload surfaces, sharing the same Multer/Cloudinary
mechanics but different data models and permission models: `User`
profile pictures (self-service, one avatar per user) and `EmployeeDocument`
attachments (HR/manager-controlled, many per employee). Both were
combined into one feature by explicit decision, since they solve the same
technical problem despite serving different business purposes.

This chapter is unusual among this project's features in one respect: a
**dedicated pre-implementation design review** (12 dimensions — Cloudinary
failure recovery, operation ordering, folder/public-id strategy, security,
performance, error handling, transactions, verification plan) ran _before_
any code was written, and caught two real correctness bugs in the plan
itself. Then, during live verification of the implementation that
followed that corrected plan, **two further real bugs** were found —
neither of which the design review could have caught, because both were
about a specific third-party API's actual runtime behavior, not this
project's own logic.

## 2. Theory

**Why Cloudinary operations can't participate in a Prisma transaction**:
a database transaction can only roll back statements the database itself
executed. Cloudinary is an external HTTP service — there is no mechanism
by which a Postgres `ROLLBACK` could undo an upload or delete that already
happened at Cloudinary. Every flow in this feature has to be sequenced by
hand to compensate for that, rather than relying on a transaction to do
it automatically.

**The governing principle, found during the design review**: sequence
operations so any failure produces an _orphan_ (an unreferenced
Cloudinary asset — invisible to users, cheap to clean up later), never a
_dangling reference_ (a database row pointing at something Cloudinary no
longer has — a user-visible broken image or link). Concretely: flows that
**add** something upload to Cloudinary first, commit the database second
— a DB failure after a successful upload just leaves an orphan. Flows
that **remove** something commit the database first, delete from
Cloudinary second, best-effort — a Cloudinary failure after a successful
DB commit just leaves an orphan. The original plan had this backwards for
three of four flows (profile-picture replace, profile-picture delete,
document delete all said "Cloudinary first, DB second") — caught and
reversed during the review, before any of it was built.

**A further simplification the review found, not just a fix**: since a
`User` has exactly one avatar, a **fixed, deterministic** Cloudinary
`public_id` (`emp-mgmt/{env}/users/{userId}/profile-picture`) combined
with `overwrite: true` replaces the asset in place — there's no separate
"old asset" to look up and delete at all for that flow, removing an
entire failure mode rather than just sequencing around it. `EmployeeDocument`
doesn't get this simplification (many documents per employee, no single
slot to overwrite), so each gets a fresh, server-generated UUID instead —
never derived from the original filename, which is also what closes off
any path-traversal-style concern on the Cloudinary side.

**Why `sanitizeUser()` had to be enforced for `User`-entity audit
snapshots, found during the theory discussion itself**: Feature 11's
audit pattern snapshots a raw record. `Employee` had no sensitive fields,
so this was safe there. `User` has a `password` field — a naive
profile-picture audit entry would have stored the bcrypt hash directly in
`beforeData`/`afterData`. This is exactly the kind of gap Feature 11's own
retrospective flagged as a future risk ("this becomes important if
additional entities are audited in the future") — and it became real the
moment `User` actually was.

## 3. Architecture

### Corrected Flow — Profile Picture Replacement

```
POST /api/v1/users/me/profile-picture
    ↓
authMiddleware → uploadProfilePicture.single('file') [Multer, memory storage]
    ↓ (400 on missing file, wrong MIME, or size limit)
user.service.uploadProfilePicture(userId, file, actor)
    ├─ userRepository.findById(userId)              [captures beforeData]
    ├─ cloudinaryStorage.uploadBuffer(buffer, {
    │      publicId: FIXED "users/<id>/profile-picture",
    │      overwrite: true, invalidate: true })      ← Cloudinary FIRST
    └─ prisma.$transaction:                          ← DB commit SECOND
         ├─ userRepository.updateProfileImage(...)
         └─ auditLogRepository.create({ entityType: 'User', beforeData: sanitizeUser(...), afterData: sanitizeUser(...) })
    ↓
200 { user }
```

No separate "delete the old asset" step exists in this flow at all — the
fixed `public_id` + `overwrite` means the upload call itself replaces the
previous picture.

### Corrected Flow — Employee Document Delete

```
DELETE /api/v1/employees/:id/documents/:documentId
    ↓
authMiddleware → requirePermission('employee:update:any')
    ↓
employeeDocument.service.deleteDocument(employeeId, documentId, actor)
    ├─ employeeRepository.findById / employeeDocumentRepository.findById   [existence checks]
    ├─ prisma.$transaction:                          ← DB commit FIRST
    │    ├─ employeeDocumentRepository.deleteById(...)
    │    └─ auditLogRepository.create({ entityType: 'EmployeeDocument', action: 'DELETE', beforeData, afterData: null })
    └─ cloudinaryStorage.deleteAsset(publicId, resourceType, context)   ← Cloudinary SECOND, best-effort
    ↓
200 { message }
```

### Layer Responsibilities

| Layer      | File                                              | Responsibility                                                   | Must NOT do                                           |
| ---------- | ------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| Middleware | `upload.middleware.js`                            | Multer config factory — memory storage, MIME whitelist, size cap | Know anything about Cloudinary or the database        |
| Utility    | `cloudinaryStorage.js`                            | The only place that calls the Cloudinary SDK — upload and delete | Decide sequencing/ordering (that's the service's job) |
| Service    | `user.service.js` / `employeeDocument.service.js` | Own the sequencing: external call, then transaction (or reverse) | Talk to `req`/`res`                                   |

## 4. Folder Structure

```
src/
├── config/
│   └── cloudinary.js               (NEW) — singleton Cloudinary client
├── middlewares/
│   ├── upload.middleware.js        (NEW) — createUploadMiddleware({allowedMimeTypes, maxSizeBytes})
│   └── error.middleware.js         (MODIFIED) — translates multer.MulterError → 400
├── utils/
│   └── cloudinaryStorage.js         (NEW) — uploadBuffer(), deleteAsset()
└── modules/
    ├── audit/
    │   └── auditLog.constants.js   (MODIFIED) — USER, EMPLOYEE_DOCUMENT entity types added
    ├── users/
    │   ├── user.repository.js      (MODIFIED) — updateProfileImage(), clearProfileImage()
    │   ├── user.service.js         (MODIFIED) — uploadProfilePicture(), deleteProfilePicture()
    │   ├── user.controller.js      (MODIFIED)
    │   └── user.routes.js          (MODIFIED) — POST/DELETE /me/profile-picture
    └── employees/
        ├── employeeDocument.repository.js  (NEW)
        ├── employeeDocument.service.js     (NEW)
        ├── employeeDocument.controller.js  (NEW)
        └── employee.routes.js       (MODIFIED) — document routes added to the existing router

prisma/
├── schema.prisma  (MODIFIED) — User gains profileImageUrl/profileImagePublicId;
│                    new EmployeeDocument model (including a resourceType
│                    column added in a second migration, once the first
│                    live bug was found - see Section 9)
└── migrations/.../add_profile_picture_and_employee_documents/
└── migrations/.../add_employee_document_resource_type/
```

## 5. File-by-File Explanation

### `src/middlewares/upload.middleware.js`

```js
const createUploadMiddleware = ({ allowedMimeTypes, maxSizeBytes }) => {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeBytes },
    fileFilter: (req, file, cb) => {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(
          new BadRequestError(
            `file: must be one of ${allowedMimeTypes.join(', ')} (received ${file.mimetype})`,
          ),
        );
      }
      cb(null, true);
    },
  });
};
```

- **`fileFilter` rejects with our own `BadRequestError` directly** —
  verified in a scratch script that Multer passes a custom error straight
  through to Express's error chain unmangled, `instanceof` intact. This
  means a bad MIME type gets a specific, clear message instead of being
  forced through Multer's generic `LIMIT_UNEXPECTED_FILE` code (whose
  default message, "Unexpected field," would have been actively
  misleading for a MIME-type rejection).
- **One factory, called twice** with different options (5 MB/images-only
  for avatars, 10 MB/PDF+images for documents) — the same
  higher-order-middleware pattern already used by `validateMiddleware`.

### `src/utils/cloudinaryStorage.js` — `deleteAsset` (after two live bug fixes)

```js
const deleteAsset = async (publicId, resourceType, context = {}) => {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
  } catch (error) {
    logger.warn(`Failed to delete orphaned Cloudinary asset ${publicId}`, {
      ...context,
      error: error.message,
    });
  }
};
```

- **`resourceType` is a required parameter, not defaulted** — see Section
  9 for the live bug this closes.
- **`invalidate: true`** — see Section 9 for the second live bug this
  closes.
- **Never throws** — this is always called after the owning database
  transaction has already committed, so the asset is by definition
  unreferenced; a failure here is logged, not surfaced to the client.

### `src/modules/employees/employeeDocument.service.js` — `uploadDocument`

```js
const uploadDocument = async (employeeId, file, actor) => {
  if (!file) throw new BadRequestError('A file is required');

  const employee = await employeeRepository.findById(employeeId);
  if (!employee) throw new NotFoundError('Employee not found');

  const { url, publicId, resourceType } = await cloudinaryStorage.uploadBuffer(file.buffer, {
    publicId: buildDocumentPublicId(employeeId),   // fresh UUID
    resourceType: 'auto',
  });

  return prisma.$transaction(async (tx) => {
    const document = await employeeDocumentRepository.create({ ..., resourceType }, tx);
    await auditLogRepository.create({ entityType: 'EmployeeDocument', action: 'CREATE', ... }, tx);
    return document;
  });
};
```

- **The employee-existence check runs before the Cloudinary call** — an
  invalid `employeeId` never wastes Cloudinary upload quota, even though
  Multer's in-memory buffering of the file itself is unavoidable (the
  body has to be parsed before any business-rule check can run).
- **`resourceType` comes from Cloudinary's response (`result.resource_type`),
  not from `file.mimetype`** — this single line is the fix for the first
  live bug in Section 9.

## 6. Request Lifecycle

Traced live during implementation and verification:

1. Uploaded a real 1×1 PNG as a profile picture → `200`, a real asset
   confirmed present on Cloudinary's CDN (fetched the returned URL
   directly, not just trusted the API response).
2. Replaced it 3 times in a row → the same fixed `public_id` every time,
   confirmed via the Cloudinary dashboard/API that exactly one asset
   exists at that path (no accumulation), and 4 `AuditLog` `UPDATE`
   entries total — **zero** contained a `password` field, checked
   explicitly across every one.
3. Deleted the profile picture → `200`; re-fetching the old URL returned
   `404` — confirmed real deletion, not just a non-error response.
4. Uploaded a PDF employee document → `201`, `resourceType: "raw"`
   (Cloudinary's own classification, since the fake test bytes weren't a
   real image or genuinely image-shaped PDF).
5. **First live bug found**: deleted that document → `200`, but
   re-fetching its URL still returned `200` — the asset was never
   actually removed. See Section 9.
6. After fixing bug #1: re-tested the same delete → `200`, but the CDN
   _still_ served the old URL as `200` for a moment. See Section 9's
   second bug.
7. After fixing bug #2: full re-test — upload, confirm live, delete,
   confirm gone (both via a direct CDN fetch and via Cloudinary's Admin
   API, which is authoritative about origin state regardless of CDN
   caching).
8. Full permission matrix verified: `ADMIN`/`MANAGER` upload and delete
   documents; a plain `EMPLOYEE` gets `403` on both; the owning
   `EMPLOYEE` can `GET` the list (`200`); a _different_ `EMPLOYEE` cannot
   (`403`) — BOLA confirmed closed.

## 7. Best Practices

- **Sequence external side effects so failure always produces an orphan,
  never a dangling reference** — decide this explicitly per flow (add vs.
  remove), don't default to "whatever order I wrote first."
- **A fixed identifier + overwrite, where cardinality allows it, removes
  an entire class of bug** rather than just handling it — always ask
  whether the "old thing" even needs a separate delete step before
  building one.
- **Never assume a third-party SDK's default parameters match your use
  case** — `cloudinary.uploader.destroy()`'s default `resource_type:
"image"` is completely reasonable for an SDK used mostly for images,
  and completely wrong the moment `resourceType: 'auto'` is used upstream
  for non-image content. This has to be checked, not assumed, for every
  external API call whose behavior branches on content type.
- **A "success" response from a delete API is not proof of deletion** —
  verify by checking the actual resource afterward (a live fetch, an
  Admin API lookup), especially the first time a new delete path is
  exercised against a real external service.

### Security implications, consolidated

- Both `public_id` strategies (fixed for the avatar, UUID-based for
  documents) are built only from server-generated values — the original
  filename is stored for display only and never touches a storage path,
  closing off path traversal on the Cloudinary side by construction.
- `sanitizeUser()` is now a hard requirement for any `User`-entity audit
  snapshot — verified live with zero exceptions across every
  profile-picture event.
- MIME-type checking is claim-based (`file.mimetype`, from the
  client-supplied `Content-Type`), not content-based — an honestly
  documented gap, not a silent one.

## 8. Performance Considerations

- Server-mediated uploads couple this API's request latency directly to
  Cloudinary's own upload latency — a deliberate, named trade-off against
  the added complexity of direct signed client-to-Cloudinary uploads.
- The fixed-`public_id`-plus-`overwrite` design for profile pictures
  removes a full extra network round-trip (no separate "find and delete
  the old asset" call) compared to the fresh-id-per-upload approach
  documents use.
- Two queries per mutating request (existence check + transaction),
  matching every other feature's DB load shape — no new indexing
  concerns (`EmployeeDocument.employeeId` is indexed).

## 9. Common Mistakes

| Mistake                                                                                                    | Why it happens                                                | How senior engineers avoid it                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assuming a delete API's default parameters apply universally                                               | The default is reasonable for the SDK's most common use case  | Check what the default actually is, and whether it matches every code path that calls the same function — here, `resource_type: "image"` silently failed for the `"raw"` (PDF) case |
| Trusting a `200`/success response as proof a resource was actually removed                                 | The API didn't throw, so it "worked"                          | Verify against the real resource afterward — a live fetch or the provider's own Admin/lookup API, not just the absence of an error                                                  |
| Forgetting CDN cache invalidation on delete                                                                | The origin delete succeeded, so the job feels done            | Remember a CDN can serve stale content from cache independently of origin state — explicitly invalidate on every delete, not just on overwrite/upload                               |
| Sequencing an external call and a DB write in whichever order is easiest to write                          | Feels arbitrary/either-should-be-fine                         | Reason explicitly about which failure mode each order produces (orphan vs. dangling reference) and choose the one that's always safe                                                |
| Applying an audit-snapshot pattern to a new entity without checking for that entity's own sensitive fields | The pattern worked fine for the first entity it was built for | Re-check every entity being newly brought under an existing pattern for fields the original entity didn't have — `User.password` is exactly this case                               |

## 10. Interview Preparation

**Q: Walk through the two real bugs found live during this feature's
verification, and why the design review didn't catch them.**

- _Concise answer_: both were about Cloudinary's actual runtime API
  behavior (default parameters, CDN caching), not about this project's
  own logic — a design review can catch flawed _sequencing_ of operations
  it reasons about, but not a third-party SDK's undocumented-feeling
  defaults, which only show up by actually calling it and checking the
  real result.
- _Detailed answer_: (1) `cloudinary.uploader.destroy()` defaults to
  `resource_type: "image"` and returns `{result: "not found"}` — not an
  error — for any other type. A PDF document, uploaded via `resourceType:
'auto'` and classified by Cloudinary as `"raw"`, appeared to delete
  successfully (the API returned `200`) while the asset was still live,
  caught only by re-fetching its URL after the "delete." Fixed by storing
  Cloudinary's own classification on the `EmployeeDocument` row at upload
  time and passing it explicitly to every `destroy()` call. (2) Even
  after that fix, a re-fetch of a just-deleted asset's URL still
  returned `200` — the origin copy was genuinely gone (confirmed via
  Cloudinary's Admin API), but the CDN was serving a cached copy. Fixed
  with `invalidate: true` on every `destroy()` call.
- _What interviewers are evaluating_: whether the candidate distinguishes
  between bugs a design review can catch (flawed logic/sequencing) and
  bugs only live verification against the real external system can catch
  (a specific API's actual behavior) — and treats both as necessary, not
  redundant.

**Q: Why does the profile-picture flow use a fixed `public_id` while
employee documents use a fresh UUID each time?**

- _Concise answer_: cardinality — one avatar per user (safe to overwrite
  in place) vs. many documents per employee (each needs its own unique
  identity).
- _Detailed answer_: a fixed `public_id` + `overwrite: true` doesn't just
  simplify the code, it eliminates an entire failure mode — there's no
  separate "old asset" to look up and delete, so there's no ordering
  question to get wrong for that step at all. That simplification
  genuinely isn't available for documents, since Cloudinary's overwrite
  model only makes sense for a single, addressable slot.
- _What interviewers are evaluating_: recognizing when a structural
  property of the data (cardinality) unlocks a real simplification,
  rather than treating both flows as needing identical machinery.

## 11. Summary

### Key Takeaways

- External services can't participate in a database transaction — every
  flow needs its operation order reasoned about by hand, not assumed.
- A "success" response is not proof of an actual effect — verify against
  the real external resource, especially the first time a new path is
  built.
- A design review catches flawed reasoning; only live verification
  against the real external system catches a third-party API's actual
  runtime quirks. Both are necessary, and finding bugs at either stage is
  the process working, not failing.

### Important Terminology

- **Orphan vs. dangling reference** — the two possible failure shapes
  when an external side effect and a database write can't be atomic; the
  design goal is always "orphan, never dangling reference."
- **CDN cache invalidation** — actively telling a CDN a cached asset is
  stale, distinct from deleting the asset at its origin.
- **Fixed vs. UUID-based identifier strategy** — choosing based on
  whether the underlying relationship is single-slot or many-per-owner.

### Design Principles

- Sequence add-flows "external first, DB second"; remove-flows "DB
  first, external second, best-effort."
- Eliminate a failure mode structurally (fixed id + overwrite) wherever
  the data's cardinality allows it, rather than just handling the failure
  well.
- Verify a third-party SDK's actual behavior for every code path that
  calls it differently (here: `resource_type: 'auto'` vs. a fixed
  `'image'`), not just the path exercised first.

### Best Practices

- Confirm deletion against the real external resource, not just the
  absence of a thrown error.
- Store a value returned by an external API rather than re-deriving it
  yourself, when the API's own answer is authoritative (Cloudinary's
  `resource_type` classification vs. guessing from `mimeType`).
- Treat every newly-added entity to an existing cross-cutting pattern
  (like audit logging) as a fresh check for that entity's own sensitive
  fields, not an automatic pass.

## 12. Revision Notes (5-minute read)

- Two upload surfaces in one feature: `User` profile pictures (two new
  columns, self-service, fixed `public_id` + `overwrite`/`invalidate`)
  and `EmployeeDocument` (new table, real FK to `Employee`, reuses
  existing `employee:*` permissions, fresh UUID `public_id` per document).
- A pre-implementation design review reversed three flows' Cloudinary/DB
  operation order (external-remove-after-DB-commit, not before) and
  adopted the fixed-id-plus-overwrite simplification for profile pictures
  — all before any code was written.
- `env.js` now validates `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/
  `CLOUDINARY_API_SECRET`.
- Audit logging (Feature 11) extended to `User` (profile-picture events
  only) and `EmployeeDocument` — `sanitizeUser()` required for every
  `User`-entity snapshot, verified live with zero `password` leaks.
- **Two real bugs found live, not by review**: `cloudinary.uploader.destroy()`
  defaulting to `resource_type: "image"` silently no-opped on non-image
  assets (fixed by storing Cloudinary's own classification per document);
  and missing `invalidate: true` left a stale CDN-cached copy after a
  real origin deletion (fixed by adding it to every `destroy()` call).
  Both required a second, small migration and real code changes, not
  just documentation updates.
- Verified live end-to-end against a real Cloudinary account (not
  mocked): uploads, replacements, deletes, the full permission matrix
  (including BOLA on document listing), and — critically — actual
  Cloudinary-side deletion confirmed via both a direct CDN fetch and
  Cloudinary's Admin API.

## 13. One-Line Interview Answers

**Q: Why can't a Cloudinary upload/delete be part of a Prisma
transaction?**
A: A database transaction can only roll back statements the database
itself executed — Cloudinary is an external HTTP service with no such
mechanism.

**Q: What's the one governing rule for sequencing Cloudinary and database
operations?**
A: Sequence so any failure produces a harmless orphan, never a
user-visible dangling reference — add-flows go external-then-DB,
remove-flows go DB-then-external.

**Q: Why did deleting a PDF document appear to succeed but not actually
remove it from Cloudinary?**
A: `cloudinary.uploader.destroy()` defaults to `resource_type: "image"`
and silently no-ops for any other type — the PDF was classified as
`"raw"`, and the delete call never said so.

**Q: Why did the asset's URL still return `200` even after that was
fixed?**
A: The origin copy was genuinely deleted, but the CDN was still serving a
cached copy — fixed by adding `invalidate: true`.

**Q: Why does the profile picture flow need no separate "delete the old
asset" step?**
A: A fixed, deterministic `public_id` combined with `overwrite: true`
replaces the asset in place — there's no second asset to find and remove.

## 14. Practical Examples From Our Codebase

Verified live, in order, against a real Cloudinary account:

```
$ curl -X POST /api/v1/users/me/profile-picture -H "Authorization: Bearer <token>" -F "file=@avatar.png"
200 {"user": {"profileImageUrl": "https://res.cloudinary.com/.../v.../emp-mgmt/development/users/<id>/profile-picture.png", ...}}

$ curl https://res.cloudinary.com/.../profile-picture.png
200   # real asset, confirmed via direct CDN fetch

$ curl -X DELETE /api/v1/users/me/profile-picture -H "Authorization: Bearer <token>"
200 {"user": {"profileImageUrl": null, ...}}

$ curl https://res.cloudinary.com/.../profile-picture.png
404   # confirmed actually gone

$ curl -X POST /api/v1/employees/<id>/documents -H "Authorization: Bearer <admin>" -F "file=@resume.pdf"
201 {"document": {"resourceType": "raw", "url": "https://res.cloudinary.com/.../raw/upload/.../documents/<uuid>", ...}}

$ curl -X DELETE /api/v1/employees/<id>/documents/<docId> -H "Authorization: Bearer <admin>"
200 {"message": "Document deleted successfully"}

# Before the fix: the URL above still returned 200 here (bug).
# After both fixes:
$ curl https://res.cloudinary.com/.../raw/upload/.../documents/<uuid>
404   # confirmed via both a direct CDN fetch and Cloudinary's Admin API
```
