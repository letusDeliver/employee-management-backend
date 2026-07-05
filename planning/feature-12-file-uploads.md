# Feature 12: File Uploads (Profile Pictures + Employee Documents) — Action Plan

Status: **Awaiting review/approval**. Nothing below has been executed yet.

Branch: `feature/12-file-uploads`, off `main`.

This plan incorporates a pre-implementation design review (see
"Cloudinary Consistency Model" below) that found and fixed two real
operation-ordering bugs before any code was written.

## Scope

Two related upload surfaces, sharing the same Multer/Cloudinary
mechanics but different data models, permission models, and audit
treatment:

- **User profile pictures** — one avatar per `User`, stored as two new
  columns (`profileImageUrl`, `profileImagePublicId`) directly on
  `User`. Self-service — any authenticated user manages their own only.
- **Employee documents** — many files per `Employee` (resumes, ID
  proof, contracts, certificates), a new `EmployeeDocument` table with
  a real FK to `Employee.id`. HR/manager-controlled, reusing
  `employee:update:any`/`employee:read:any`/`employee:read:own` — no
  new permission keys.

Audit logging (Feature 11) is extended to cover both surfaces.

## Confirmed decisions

- **Profile picture as columns, not a table** — a `User` has exactly
  one avatar; a separate table would be pure overhead for a 1:1,
  single-value relationship.
- **`EmployeeDocument` as its own table** — an `Employee` can have many
  documents; this is a genuine one-to-many, unlike the avatar.
- **Multer: memory storage**, not disk — the file buffers in memory and
  streams straight to Cloudinary via `cloudinary.uploader.upload_stream()`;
  no temp file to create or clean up on every code path including errors.
- **Manual two-step upload**, not the `multer-storage-cloudinary`
  package — Multer (middleware) parses the multipart request; a service
  function calls the Cloudinary SDK directly. Keeps "parse the request"
  and "call an external API" as separate concerns, consistent with
  Clean Architecture's layering.
- **Server-mediated uploads** (client → our API → Cloudinary), not
  direct signed client-to-Cloudinary uploads — simpler, keeps
  authorization entirely server-side. A deliberate trade-off against
  scale (routes file bytes through our server, and couples this API's
  request latency directly to Cloudinary's own latency) — revisit only
  if upload volume ever makes that cost real.
- **Return Cloudinary's own URL directly** — no proxy-download endpoint;
  the client fetches from Cloudinary's CDN, not through us.
- **No new RBAC permission keys** — profile pictures are gated by
  "is this the authenticated user's own record" (no permission check at
  all, same pattern as `/auth/me`); employee documents reuse
  `employee:update:any`/`employee:read:any`/`employee:read:own`.
- **Audit logging extended, with one critical safety rule**: `User` has
  a `password` field `Employee` never had. Any audit snapshot of a
  `User` **must** go through the existing `sanitizeUser()` (which
  already strips `password`), never a raw record dump — otherwise a
  profile-picture audit entry would store the bcrypt hash in
  `beforeData`/`afterData`. This was caught and corrected during the
  theory discussion, before any code was written.
- **File-type whitelist**: profile pictures — JPEG/PNG/WebP only (it's
  an avatar, always an image; SVG deliberately excluded — it can embed
  `<script>` content and is a known image-upload XSS vector). Employee
  documents — PDF + JPEG/PNG/WebP (covers scanned documents and native
  PDFs).
- **Size caps**: profile picture 5 MB; employee document 10 MB — both
  enforced by Multer's `limits.fileSize`, which aborts mid-stream once
  exceeded rather than buffering the full body first.

## Permissions Matrix

| Action         | Profile Picture                                    | Employee Document                          |
| -------------- | -------------------------------------------------- | ------------------------------------------ |
| Upload/replace | Authenticated (self only, no permission check)     | `employee:update:any`                      |
| Delete         | Authenticated (self only, no permission check)     | `employee:update:any`                      |
| View/list      | Implicit — returned on `/auth/me` and `GET /users` | `employee:read:any` or `employee:read:own` |

## Cloudinary Consistency Model

Cloudinary is an external service — a Prisma transaction cannot roll
back a Cloudinary upload or delete. This section is the result of a
dedicated pre-implementation review and governs every flow below.

**Governing principle**: sequence operations so that any failure
produces an _orphan_ (an unreferenced Cloudinary asset — invisible to
users, cheap to clean up later) and never a _dangling reference_ (a
database row pointing at something that no longer exists — a
user-visible broken image or link). Concretely:

- **Flows that add something** (upload a new picture, upload a new
  document): Cloudinary upload happens **first**, the Prisma transaction
  (DB write + audit entry) commits **second**. If the upload fails,
  nothing has touched the database yet. If the DB transaction fails
  after a successful upload, the result is an orphaned Cloudinary asset
  — not a broken reference.
- **Flows that remove something** (delete a document, delete a profile
  picture, replace a profile picture's _old_ asset): the Prisma
  transaction (DB write + audit entry) commits **first**; the Cloudinary
  delete happens **second**, best-effort — logged at `warn` level with
  the asset's `publicId` and entity context if it fails, but **does not
  fail the request**. The database (this app's source of truth for what
  exists) is already consistent by the time the client gets a response;
  a failed cleanup afterward just leaves a harmless orphan.

This reverses the order this plan originally sketched for profile-picture
replace/delete and employee-document delete (all three originally said
"Cloudinary first, DB second") — caught and corrected during design
review, before implementation.

**Profile picture replacement — a further simplification, not just a
reordering.** Since a `User` has exactly one avatar, use a **fixed,
deterministic Cloudinary `public_id`** per user
(`emp-mgmt/{NODE_ENV}/users/{userId}/profile-picture`) with
`overwrite: true` and `invalidate: true` (the latter busts the CDN cache
for the previous version). Uploading a new picture replaces the same
asset in place — there is no separate "old asset" to explicitly delete
at all for this flow, so that step and its distinct failure mode don't
exist. (Cloudinary does still increment an internal version segment in
the delivery URL on each overwrite, so `profileImageUrl` in the database
still needs updating on every replacement — the `public_id` is fixed,
the full URL isn't. If the DB transaction fails after a successful
overwrite-upload, the DB shows a stale, previous-version URL rather than
a URL pointing at a fully-deleted asset — a smaller, non-corrupting
residual inconsistency, accepted rather than specially engineered around.)

**Employee documents** don't have this simplification available (many
documents per employee, so no single fixed slot to overwrite) — each
gets a fresh, **server-generated UUID** as its `public_id`'s leaf segment
(`emp-mgmt/{NODE_ENV}/employees/{employeeId}/documents/{uuid}`), never
derived from the original filename or any other user-supplied value.
This is also the property that closes any path-traversal-style concern
on the Cloudinary side — the `public_id` is always built from data our
own server generated (Prisma UUIDs, `crypto.randomUUID()`), never from
client input.

**Folder convention** (finalized here):

```
emp-mgmt/{NODE_ENV}/users/{userId}/profile-picture
emp-mgmt/{NODE_ENV}/employees/{employeeId}/documents/{documentUuid}
```

`emp-mgmt` roots the whole app's assets in case this Cloudinary account
is ever shared with another project; `{NODE_ENV}` keeps dev/test uploads
out of the same folder tree as production assets, so "delete everything
under `emp-mgmt/development/`" is a safe, obvious cleanup operation.

**Known, accepted limitations of this model** (named explicitly, not
solved with additional machinery in this feature):

- **Orphaned assets can accumulate** — any DB-commit failure after a
  successful upload, or any failed best-effort cleanup delete, leaves an
  unreferenced asset in Cloudinary. Harmless (invisible to every
  user-facing code path) but not automatically reconciled. A periodic
  job comparing Cloudinary assets against DB rows is the natural future
  remedy _if_ this ever becomes a real operational cost — not built now.
- **Concurrent replacement is last-write-wins, not verified under true
  concurrency** — two simultaneous profile-picture replacements (or two
  simultaneous document deletes) can race; worst case is one extra
  orphaned/stale asset, never data corruption. Same honest treatment as
  other concurrency caveats already accepted elsewhere in this project
  (e.g. Feature 9's concurrent-registration gap).
- **Cloudinary SDK errors on the upload path** (bad credentials, outage,
  timeout) are not translated into a specific typed error — they
  propagate to the existing generic error handler, which already renders
  a safe `"Internal Server Error"` 500 (consistent with every other
  unexpected-error path in this API). The real error **is logged
  server-side at `error` level with operation/entity context**, so an
  actual Cloudinary outage is diagnosable from logs even though the
  client only ever sees the generic message.

## A verification item carried in from Feature 9's habit

Multer emits its own error type (`multer.MulterError`, e.g.
`LIMIT_FILE_SIZE`, `LIMIT_UNEXPECTED_FILE`) on rejection — this needs to
be translated into our typed `BadRequestError` (400) at the centralized
error handler, the same treatment as the JSON-syntax-error and Prisma
`P2003` translations already in place, rather than let a raw
`MulterError` reach a client as an unstyled `500`. The exact
`multer.MulterError` shape will be verified in a scratch check before
writing the real translation code (established project habit).

Separately — and not covered by the `MulterError` check — **Multer does
not reject a request that omits the file field entirely**;
`upload.single(...)` simply leaves `req.file` as `undefined` and calls
`next()` normally. Each controller (or a shared check in the upload
middleware) must explicitly check `if (!req.file) throw new
BadRequestError('A file is required')` — this was missing from the
original plan and is now an explicit action item below.

## Schema changes

```
User (modified)
  + profileImageUrl     String?
  + profileImagePublicId String?

EmployeeDocument (new)
  id          uuid PK
  employeeId  uuid  → Employee.id, ON DELETE CASCADE
  url         String        (Cloudinary secure_url)
  publicId    String        (Cloudinary's own id — needed to delete the asset later)
  fileName    String        (original filename, for display only — never used to
                              build a storage path or public_id; duplicate filenames
                              across documents are a non-issue since the public_id
                              is always a server-generated UUID, not filename-derived)
  mimeType    String
  size        Int
  uploadedBy  uuid, nullable → User.id, ON DELETE SET NULL
  createdAt   DateTime @default(now())

  @@index([employeeId])
```

`EmployeeDocument` queries join through `Employee` and require
`deletedAt: null` — a soft-deleted employee's documents aren't
independently reachable. `EmployeeDocument` deletion is a real, **hard**
delete (not soft, unlike `Employee`) — `AuditLog`'s `beforeData` already
captures the document's full metadata at the moment of deletion, which
is exactly what a soft-delete would otherwise exist to preserve; adding
a parallel soft-delete mechanism here would be redundant given Feature
11's audit trail already covers the history-preservation need.

## New environment variables (closing a gap deferred since Feature 4)

`env.js`'s Zod schema gains `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET` — all required, no defaults, matching the
existing fail-fast-at-boot pattern. `.env.example` already has the
placeholders from Feature 1's scaffolding.

## Actions

1. **Install `multer` and `cloudinary`.** Verify both libraries' actual
   APIs in a scratch script first (Multer's `MulterError` shape,
   Cloudinary's `uploader.upload_stream()` callback signature, and the
   exact option names for `overwrite`/`invalidate`) — this project's
   established habit, having caught real issues in Express 5, Prisma's
   driver adapter, and Winston in past features.

2. **Update `src/config/env.js`**: add the three `CLOUDINARY_*` fields
   to the Zod schema.

3. **Update `prisma/schema.prisma`**: `User` gets the two new nullable
   columns; new `EmployeeDocument` model. One migration.

4. **Create `src/config/cloudinary.js`**: a singleton Cloudinary client,
   configured from `env.js` — same one-shared-instance pattern as
   `database.js`/`logger.js`.

5. **Create `src/utils/cloudinaryStorage.js`**:
   - `uploadBuffer(buffer, { publicId, folder, resourceType, overwrite, invalidate })`
     → `{ url, publicId }`.
   - `deleteAsset(publicId)` — used only in the "remove" half of each
     flow, always called _after_ the corresponding DB transaction has
     committed, and always wrapped so a failure is logged (`logger.warn`,
     with `publicId` + entity context) rather than thrown/propagated.
   - Shared by both upload surfaces, so "how do we talk to Cloudinary"
     exists in exactly one place.
   - Cloudinary SDK errors from `uploadBuffer` itself (the "add" half)
     are _not_ caught here — they propagate up to the service, and from
     there to the generic error handler, logged with `error` level
     (see the Cloudinary Consistency Model section above).

6. **Create `src/middlewares/upload.middleware.js`**: a factory,
   `createUploadMiddleware({ allowedMimeTypes, maxSizeBytes })` →
   configured Multer instance (memory storage, `fileFilter` rejecting
   anything outside the whitelist, `limits.fileSize`). Called twice,
   once per surface, with different options.

7. **Update `src/middlewares/error.middleware.js`**: translate
   `multer.MulterError` into a `BadRequestError` with a friendly,
   code-specific message (e.g. `LIMIT_FILE_SIZE` → "File exceeds the
   maximum allowed size", with a sane fallback message for any other
   `MulterError` code so none can slip through unhandled).

8. **Extend `src/modules/audit/auditLog.constants.js`**:
   `AUDIT_ENTITY_TYPES` gains `USER: 'User'` and
   `EMPLOYEE_DOCUMENT: 'EmployeeDocument'`.

9. **Profile picture — `src/modules/users/`**:
   - `user.repository.js`: `updateProfileImage(userId, { url, publicId })`,
     `clearProfileImage(userId)` — each accepting an optional transaction
     client.
   - `user.service.js`:
     - `uploadProfilePicture(userId, file, actor)` — throws
       `BadRequestError` if `file` is missing. Uploads the new image to
       Cloudinary **first**, using the fixed `public_id`
       (`users/{userId}/profile-picture`) with `overwrite: true` and
       `invalidate: true` — no separate old-asset lookup/delete needed.
       Only after the upload succeeds: `prisma.$transaction` updates the
       two columns and writes an `AuditLog` entry (`entityType: 'User'`,
       `action: 'UPDATE'`, `beforeData`/`afterData` via `sanitizeUser()`,
       **never** the raw record).
     - `deleteProfilePicture(userId, actor)` — `404` if none set;
       otherwise the `prisma.$transaction` (null both columns + write the
       audit entry) commits **first**, then the Cloudinary asset is
       deleted **after** commit, best-effort (logged, not thrown, on
       failure).
   - `user.controller.js`: `uploadProfilePicture`, `deleteProfilePicture` —
     both operate on `req.user.id` only (no `:id` param — this is always
     "me," the same pattern `/auth/me` already established).
   - `user.routes.js`: `POST /me/profile-picture` (with the upload
     middleware), `DELETE /me/profile-picture` — both behind
     `authMiddleware` only, no `requirePermission`.

10. **Employee documents — `src/modules/employees/`** (new files
    alongside the existing Employee CRUD files, not a separate module —
    documents are a sub-resource of Employee):
    - `employeeDocument.repository.js`: `create`, `findAllByEmployeeId`
      (joined through `Employee`, `deletedAt: null`), `findById`, `delete`
      — each accepting an optional transaction client, same pattern as
      `employee.repository.js`.
    - `employeeDocument.service.js`:
      - `uploadDocument(employeeId, file, actor)` — throws
        `BadRequestError` if `file` is missing; verifies the employee
        exists and isn't soft-deleted (`404` otherwise) _before_ calling
        Cloudinary at all. Uploads to Cloudinary (a fresh
        `crypto.randomUUID()`-based `public_id`) **first**; only after
        that succeeds does `prisma.$transaction` create the
        `EmployeeDocument` row and write the audit entry.
      - `listDocuments(employeeId, requester)` — same `:any`/`:own`
        ownership-check shape as `employee.service.js`'s
        `getEmployeeById`.
      - `deleteDocument(employeeId, documentId, actor)` — `404` if the
        document doesn't exist or belongs to a different employee. The
        `prisma.$transaction` (delete the row + write the audit entry)
        commits **first**; the Cloudinary asset is deleted **after**
        commit, best-effort.
    - `employeeDocument.controller.js`: thin, mirrors the existing
      Employee controller's shape.
    - Routes added to the existing `employee.routes.js` (documents are
      Employee's sub-resource, not a separate router):
      `POST /:id/documents` (`employee:update:any` + upload middleware),
      `GET /:id/documents` (`employee:read:any` or `:own`),
      `DELETE /:id/documents/:documentId` (`employee:update:any`).

11. **Manual verification** (live, real files):
    - Profile picture: valid image upload → `200`/`201`; re-upload
      replaces it in place (same fixed `public_id`, confirmed via
      Cloudinary's own dashboard/API that only one asset exists at that
      path, not an accumulating trail); invalid MIME type → `400`;
      oversized file → `400`; no file field → `400`; unauthenticated →
      `401`; delete → `200`, confirmed gone from Cloudinary (not just a
      non-error response); delete again (nothing set) → `404`.
    - **Replace the profile picture three times in a row** — confirm
      each replacement leaves exactly one asset at the fixed path
      (no accumulation), and the audit log shows three distinct
      `UPDATE` entries.
    - Employee documents: valid PDF and image upload → `201`; `GET
/:id/documents` lists them; invalid type/oversized → `400`; as
      `EMPLOYEE` uploading → `403`; as the owning `EMPLOYEE` viewing →
      `200`; as a _different_ `EMPLOYEE` viewing → `403`; delete → `200`,
      confirmed gone from Cloudinary; delete again → `404`; upload to a
      nonexistent/soft-deleted employee → `404`.
    - **Upload the identical file twice** for the same employee — confirm
      this is allowed (two separate `EmployeeDocument` rows, no dedup
      logic) as a deliberate, tested choice, not an accident.
    - **Cloudinary outage simulation** — temporarily use invalid
      credentials (or point at an unreachable host); confirm the client
      gets a clean `500` (no raw SDK error/stack leak) and that **no**
      `EmployeeDocument`/`User` row or `AuditLog` entry was created for
      the failed attempt (upload happens before any DB write, so a
      failure there should touch nothing).
    - **DB failure after a successful Cloudinary upload** — verified by
      code inspection (confirming the try/catch structure correctly
      surfaces a clean error without leaving the process in a bad state),
      not by live fault-injection tooling — same "verified by reasoning"
      treatment already used for the Feature 7 `RefreshToken`/`register()`
      gap.
    - **Concurrent-replacement race** — noted as an honestly-documented,
      not-independently-verified-under-true-concurrency limitation (see
      the Cloudinary Consistency Model section), not something this
      feature builds fault-injection infrastructure to test for real.
    - Audit: confirm `AuditLog` rows for every mutation above
      (`entityType: 'User'` for profile-picture events, `entityType:
'EmployeeDocument'` for document events) — **explicitly confirm no
      `password` field appears anywhere in a `User`-entity audit row's
      `beforeData`/`afterData`**, the one non-negotiable check for this
      feature.
    - `npm run lint` / `npm run format:check` clean.

12. **Update `handbook/API_ENDPOINTS.md`**: full 20-section entries for
    the 5 new endpoints (2 profile-picture, 3 employee-document), plus a
    note on `GET /auth/me`/`GET /users` now including
    `profileImageUrl`/`profileImagePublicId` in the `user` shape (Rule 17).

13. **Update root `README.md`** (Rule 16) and `CLAUDE.md`'s Progress
    Log — check off "File uploads (Multer + Cloudinary)."

14. **Write `handbook/12-file-uploads.md`** per the standing habit,
    including both the audit-safety finding and the Cloudinary
    operation-ordering findings as named, verified examples of the
    pre-implementation review catching real bugs before they were built.

## Explicitly out of scope

- Admin managing another user's profile picture on their behalf —
  self-service only, for now.
- MIME-type sniffing from file magic bytes — only the client-supplied
  `Content-Type` (via Multer's `file.mimetype`) plus extension
  whitelisting are checked; the actual file content is never inspected.
  An honestly-documented, real gap, same treatment as other named gaps
  in this project.
- A cap on the number of documents per employee — unbounded, for now.
- Direct signed client-to-Cloudinary uploads — server-mediated only.
- A document-download-proxy endpoint — clients use the returned
  Cloudinary URL directly.
- PDF content sanitization (PDFs can theoretically embed JavaScript) —
  accepted as a known risk category common to any system accepting PDF
  uploads; fully sanitizing PDF content would need a dedicated library,
  real overengineering for this project's scale.
- Orphaned-Cloudinary-asset reconciliation — no periodic cleanup job;
  see the Cloudinary Consistency Model section for why this is an
  accepted, harmless characteristic of the design rather than a defect.
