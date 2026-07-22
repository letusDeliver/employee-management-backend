# Feature 1: Project Setup & Folder Structure — Action Plan

Status: **Awaiting review/approval**. Nothing below has been executed yet.

## Scope

This feature only scaffolds the project skeleton — folder structure, package
metadata, and version-control hygiene. It deliberately does **not** install
framework/runtime dependencies (Express, Prisma, Zod, Winston, JWT, Multer,
Cloudinary, Swagger) — each of those belongs to its own upcoming feature per
the roadmap in `CLAUDE.md`, and installing them now would blur feature
boundaries.

## Actions

1. **Initialize Git repository** (`git init`).
   This directory is not currently under version control — we want every
   subsequent feature tracked as its own reviewable commit.

2. **Create `.gitignore`**.
   Exclude `node_modules/`, `.env`, `logs/*` (keep the folder via `.gitkeep`),
   `dist/`, `coverage/`, and common OS/editor artifacts (`.DS_Store`,
   `Thumbs.db`, `.vscode/` optional).

3. **Initialize `package.json`** (`npm init -y`, then hand-edit).
   - Set `"type": "module"` — enables native ES Module `import`/`export`
     project-wide, per project rules (no TypeScript, no CommonJS).
   - Add an `"engines"` field pinning a Node.js major version, so the
     required runtime is explicit for anyone (or any container) running this
     later.
   - Add placeholder `scripts`: `"start"` and `"dev"` (dev script wired to
     `nodemon` — see next step).

4. **Install minimal dev tooling.**
   - `nodemon` (dev dependency) — auto-restarts the server on file changes;
     needed as soon as we write _any_ runnable code in the next feature.
   - **Optional, needs your decision**: ESLint + Prettier for enforced code
     style/formatting. Common in enterprise Node codebases but adds initial
     configuration overhead. Flagging this as a choice rather than assuming
     it — confirm yes/no before it's included.

5. **Scaffold the full folder skeleton** under `src/`, exactly matching the
   approved architecture:

   ```
   src/
   ├── config/
   ├── modules/
   │   ├── auth/
   │   ├── users/
   │   └── employees/
   ├── middlewares/
   ├── errors/
   ├── utils/
   ├── routes/
   └── docs/
   ```

   Each empty folder gets a `.gitkeep` placeholder file, since Git does not
   track empty directories — this makes the structure visible and
   committable before any real files exist in it.

6. **Create `.env.example`** at the project root.
   Documents every environment variable the app will eventually need
   (`PORT`, `NODE_ENV`, `DATABASE_URL`, `JWT_ACCESS_SECRET`,
   `JWT_REFRESH_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
   `CLOUDINARY_API_SECRET`, etc.) with placeholder values only — no real
   secrets. Actual parsing/validation of these (via Zod) is the
   "Environment config & validation" feature, not this one.

7. **Reserve the `prisma/` folder** at the project root (empty, with
   `.gitkeep`). The actual `schema.prisma` is written in the
   "PostgreSQL + Prisma setup" feature — this step only reserves the
   location so the folder structure is complete.

8. **Reserve the `logs/` folder** at the project root (empty, with
   `.gitkeep`). Winston configuration itself is a later feature.

9. **Update `CLAUDE.md`** — check off "Project setup & folder structure" in
   the Progress Log once everything above is verified.

10. **Verify** — print the final folder tree and confirm it matches the
    approved architecture from our planning discussion exactly, before
    moving on.

## Explicitly out of scope (deferred to later features)

- Installing `express`, `helmet`, `cors`, `morgan`, `winston`, `zod`,
  `jsonwebtoken`, `prisma`/`@prisma/client`, `multer`, `cloudinary`,
  `swagger-jsdoc`/`swagger-ui-express`.
- Writing `app.js` / `server.js` logic.
- Real values in `.env`.
- Defining the Prisma schema.
- Any controller/service/repository code.

## Open question for you

- Do you want ESLint + Prettier set up as part of this feature (step 4), or
  deferred/skipped? This is the one decision point in this plan that isn't
  purely mechanical scaffolding.
