# Chapter 1: Project Setup & Folder Structure

## 1. Introduction

This feature is the foundational scaffolding of the backend: the module
system, the package manifest, the linting/formatting toolchain, and the
folder skeleton that physically encodes our Clean Architecture +
Feature-First decisions — all put in place **before a single line of
runtime code exists**.

It exists because every codebase needs a place to put things before it has
things to put. If this decision is deferred and made ad hoc as features get
built, the structure ends up reflecting the order features happened to be
written in, not a deliberate design — and retrofitting structure onto a
grown codebase is far more expensive than defining it up front.

In the overall architecture, this is **layer 0** — pure infrastructure with
zero business logic. Every other feature (Express bootstrap, Prisma, Auth,
RBAC, Employee CRUD…) is built _inside_ the skeleton this feature creates.

---

## 2. Theory

**The problem this solves**: unmanaged Node.js projects tend to organize
code around whatever was convenient at the moment of writing, not a plan.
Left alone, this produces:

- "God folders" where unrelated files accumulate because there was never a
  clear rule for where things go.
- A mixed module system (`require()` next to `import`), which happens
  constantly in real codebases that grow organically and is a constant
  source of subtle bugs (e.g., inconsistent `this` behavior, or CJS/ESM
  interop issues with default exports).
- Inconsistent code style across contributors/sessions, because nothing
  enforces it mechanically.
- No agreed answer to "does this new file's logic belong in a controller,
  a service, or a repository?" — so it ends up wherever is fastest that day.

**Why modern backends invest in this first**: front-loading structural and
tooling decisions is dramatically cheaper than migrating later. Compare the
cost of choosing ES Modules on day one versus converting 200 existing
`require()` files to `import` after the fact, or adding ESLint after 10,000
already-inconsistent lines exist (every one becomes a lint error to triage).

**Real-world examples**: this is exactly why frameworks like NestJS ship a
CLI that scaffolds `nest generate module/controller/service` — it's
enforcing the same discipline we're doing by hand here. Angular does the
identical thing with `ng generate component/service`. You've been relying
on this kind of enforced structure your entire Angular career without
necessarily naming it — we're now building the equivalent for a framework
(Express) that doesn't provide it out of the box.

**Advantages**:

- Predictable file locations — "where do I put X" has exactly one answer.
- Code style enforced mechanically (ESLint/Prettier), not through code
  review nagging.
- Fast onboarding — a new contributor can infer the whole system's shape
  from the folder tree alone.

**Trade-offs**:

- Upfront ceremony before any feature exists — folders like
  `modules/employees/` sit empty for a while, which can look like
  premature scaffolding to an outside reviewer. It's a deliberate,
  low-cost bet that paying this now is cheaper than paying it later once
  the pattern is inconsistent.
- A rigid structure can feel like overhead for trivial features — but
  consistency across the whole codebase is worth more than saving a few
  minutes on the simplest module (this trade-off was discussed explicitly
  when deciding controllers/services/repositories for every module, even
  ones with near-zero business logic).

**Common mistakes developers make**:

- Starting with CommonJS "because tutorials use it" and migrating to ESM
  later, once dozens of files already exist.
- Not deciding layer-first vs. feature-first organization up front, and
  ending up with a mix of both as the project grows.
- Adding linting/formatting "once the project stabilizes" — which in
  practice never happens cleanly, because by then every file needs
  reformatting in one disruptive commit.
- Committing `node_modules/`, `.env`, or other machine/secret-specific
  files because `.gitignore` wasn't set up before the first commit.

---

## 3. Architecture

No request-handling code exists yet in this feature — that begins in
[Chapter 2](./02-express-app-bootstrap.md). What this feature establishes is
the **container** the request pipeline will run inside:

```
src/
├── config/          ← infrastructure config (env, DB, logger) — not yet populated
├── modules/          ← domain features, each self-contained
│   ├── auth/
│   ├── users/
│   └── employees/
├── middlewares/      ← cross-cutting request concerns
├── errors/           ← typed error hierarchy
├── utils/            ← stateless helpers
├── routes/           ← router aggregation
└── docs/             ← API documentation assembly
```

The Clean Architecture request flow this skeleton is built to eventually
support:

```
HTTP Request
    ↓
Route            (defines endpoint, wires middleware)
    ↓
Middleware chain (auth → rbac → validation)
    ↓
Controller       (thin — HTTP ⇄ domain translation only)
    ↓
Service          (business logic, orchestration)
    ↓
Repository       (Prisma queries only)
    ↓
PostgreSQL
```

Each layer only depends on the layer directly below it, never the reverse —
this is the Dependency Rule that justifies the folder split.

---

## 4. Folder Structure

| Folder                | Why it exists                                                                                             | Why NOT elsewhere                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config/`         | Centralizes reading of environment/infrastructure config (env vars, DB client, logger)                    | If config reads were scattered through feature files, there'd be no single place to audit "what does this app need to run"                                                                  |
| `src/modules/<name>/` | Groups everything about one domain concept (routes, controller, service, repository, validation) together | Prevents a layer-first split (`controllers/`, `services/`, `repositories/` each holding files for every entity) where related code for one feature is scattered across 4+ top-level folders |
| `src/middlewares/`    | Cross-cutting concerns that apply across many/all routes (auth, RBAC, validation runner, error handling)  | Doesn't belong inside a specific `modules/` folder since it's not owned by one domain                                                                                                       |
| `src/errors/`         | A typed hierarchy of "expected" errors, usable by every module                                            | Kept separate from `middlewares/` because errors are _data_ (what went wrong), while `error.middleware.js` is _behavior_ (what to do about it)                                              |
| `src/utils/`          | Small, stateless, reusable helpers with no business meaning                                               | Anything with business meaning does NOT belong here — that's a service's job                                                                                                                |
| `src/routes/`         | Aggregates every module's router under one mount point (`/api/v1`)                                        | Individual module routers still live inside their own `modules/<name>/` folder — this is only the aggregator                                                                                |
| `src/docs/`           | Assembles the OpenAPI/Swagger spec                                                                        | Kept out of `modules/` since API documentation is a cross-cutting concern, not a domain                                                                                                     |
| `prisma/`             | Reserved for the Prisma schema and migrations (populated in a later feature)                              | Prisma's own tooling expects this folder name/location at the project root — not configurable without extra setup                                                                           |
| `logs/`               | Reserved for Winston's file transport output (populated in a later feature)                               | Kept out of `src/` since it's generated runtime output, not source code                                                                                                                     |

---

## 5. File-by-File Explanation

### `.gitignore`

- **Responsibility**: tells Git which paths to never track.
- **Key entries**: `node_modules/` (regenerable, huge), `.env` (secrets),
  `logs/*` (runtime output, except `.gitkeep` to keep the folder itself
  trackable), `dist/`/`coverage/` (build/test output), OS/editor artifacts.
- **Best practice**: exclude _generated_ and _secret_ files, never
  hand-maintained source.
- **Interview question**: _"Why gitignore `node_modules` instead of
  committing it?"_ — Because it's fully reproducible from `package.json` +
  the lockfile, and committing it bloats repository size and creates
  merge-conflict noise on every dependency update.

### `package.json`

- **Responsibility**: the project manifest — identity, dependencies,
  scripts, and module system.
- **Key settings**:
  - `"type": "module"` — enables native ES Module syntax project-wide.
  - `"engines": { "node": ">=20.0.0" }` — documents/enforces the minimum
    supported Node version.
  - `"main": "src/server.js"` — the entry point.
  - `scripts.dev` — `nodemon src/server.js`, auto-restarts on file changes.
  - `scripts.lint` / `scripts.format` — mechanical enforcement, runnable
    locally and (later) in CI.
- **Dependencies vs. devDependencies**: `nodemon`, `eslint`, `prettier` and
  their plugins are **devDependencies** — needed only while developing, not
  at runtime in production.
- **Best practice**: pin an `engines` range so anyone (or any container)
  running this project knows the exact runtime contract.
- **Interview question**: _"What's the practical difference between
  `dependencies` and `devDependencies`?"_ — `npm install --production` (or
  `NODE_ENV=production npm install`) skips `devDependencies` entirely,
  which is why linters/test runners must never end up in `dependencies` —
  it needlessly bloats the production install and, at the container-image
  level, the deployable artifact.

### `eslint.config.js`

- **Responsibility**: statically analyzes code for likely bugs and
  enforces a small set of stylistic rules that Prettier doesn't own.
- **Key structure** (ESLint v9+ flat config, the only format ESLint 10
  supports):
  ```js
  export default [
    { ignores: ['node_modules/**', 'logs/**', 'dist/**', 'coverage/**'] },
    js.configs.recommended,
    {
      languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
      rules: {
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        eqeqeq: ['error', 'always'],
        'prefer-const': 'error',
        'no-var': 'error',
      },
    },
    eslintConfigPrettier,
  ];
  ```
- **Why `eslint-config-prettier` is last**: it disables every ESLint rule
  that would conflict with Prettier's formatting decisions, so the two
  tools never fight over the same concern (ESLint owns _correctness_,
  Prettier owns _formatting_).
- **`argsIgnorePattern: '^_'`**: lets an intentionally-unused parameter
  (e.g., `_next` in a 4-arg error middleware — see Chapter 2) be named
  descriptively without tripping `no-unused-vars`.
- **Interview question**: _"Why run ESLint and Prettier together instead
  of just one?"_ — They solve different problems: Prettier is an opinionated
  formatter with no judgment about code quality (it will happily format a
  bug); ESLint catches actual correctness issues (unused variables, `==`
  instead of `===`, accidental `var`) but historically also tried to own
  formatting, which caused rule conflicts — hence delegating all
  formatting concerns to Prettier via `eslint-config-prettier`.

### `.prettierrc.json` / `.prettierignore`

- **Responsibility**: fixes every formatting decision (quotes, semicolons,
  trailing commas, line width) so it's never a matter of individual taste
  or a code-review debate.
- **Key settings**: single quotes, semicolons required, trailing commas
  everywhere valid, 100-character print width.
- **Best practice**: format is enforced by `npm run format:check`,
  runnable in CI later — a PR either matches the standard or it doesn't;
  no human needs to comment "please add a semicolon."

### `.env.example`

- **Responsibility**: documents every environment variable the application
  will eventually need, with placeholder (non-secret) values.
- **Why it's committed while `.env` is not**: `.env.example` is
  documentation — it tells any future developer (or your future self)
  exactly what to configure, without exposing real credentials.
- **Interview question**: _"Why maintain both `.env` and `.env.example`?"_
  — Twelve-Factor App principle: configuration lives in the environment,
  never in source control, but the _shape_ of that configuration (which
  keys exist) is part of the codebase's documentation and must be
  reviewable in a PR like any other change.

---

## 6. Request Lifecycle

Not applicable to this feature — no HTTP server or request-handling code
exists yet. The request lifecycle is introduced in
[Chapter 2: Express App Bootstrap](./02-express-app-bootstrap.md).

---

## 7. Best Practices

- **ES Modules over CommonJS**: `import`/`export` is the standard going
  forward in the Node ecosystem, supports static analysis (tree-shaking,
  better IDE tooling), and matches the syntax you already use daily in
  Angular/TypeScript — reducing context-switching cost.
- **Commit the lockfile (`package-lock.json`)**: guarantees every machine
  (including CI and production builds) installs the _exact_ same
  dependency tree, not just a version that satisfies the semver range.
- **`nodemon` as a devDependency, never a production dependency**: it's a
  development convenience (auto-restart on file change) with zero purpose
  in a running production process, which uses `node src/server.js`
  directly via `npm start`.
- **One clearly-owned tool per concern**: ESLint for correctness, Prettier
  for formatting — never two tools fighting over the same job.

---

## 8. Security Considerations

- **`.env` is gitignored from the very first commit** — the single most
  common real-world credential leak is a `.env` file committed before
  anyone thought to exclude it. Setting this up before any secret exists
  means there's never a window where a real secret could leak.
- **`.env.example` contains zero real values** — only placeholders/dummy
  strings, so it's safe to commit and share.
- **`"engines"` field** encourages running on a maintained, patched Node.js
  version — running end-of-life Node versions means missing security
  patches for the runtime itself.
- **Dependencies installed from the public npm registry** carry inherent
  supply-chain risk (this applies to every Node project); committing the
  lockfile at least pins exact resolved versions so an unexpected
  transitive-dependency update can't silently introduce a compromised
  package between installs.

---

## 9. Performance Considerations

There's minimal _runtime_ performance impact from this feature — no
server exists yet. What it does affect:

- **Developer velocity at scale**: a predictable structure and mechanical
  style enforcement is what lets a codebase scale to many contributors and
  many features without slowing down — this is "performance" at the team
  level, not the CPU level.
- **Cold-start footprint**: choosing a minimal toolchain now (no bundler,
  no transpiler — native ESM run directly by Node) keeps the eventual
  production start-up lightweight; every additional build step is a future
  trade-off to consider deliberately, not something to accumulate by
  default.

---

## 10. Common Mistakes

| Mistake                                          | Why it happens                                                        | How senior engineers avoid it                                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Mixing `require()` and `import`                  | Copy-pasting from older tutorials/Stack Overflow answers              | Commit to ESM in `package.json` from the first commit; let ESLint flag any `require()` usage                                         |
| Choosing folder structure per-feature as you go  | Feels faster in the moment for the very first feature                 | Decide feature-first vs. layer-first once, up front, and document it (this handbook)                                                 |
| Deferring linting "until the project stabilizes" | Seems like it saves setup time early                                  | Set it up in the same commit as `package.json` — the marginal cost is minutes, the deferred cost is hours of mass-reformatting later |
| Committing `.env` "just this once"               | Working under time pressure, forgetting `.gitignore` isn't set up yet | `.gitignore` is written _before_ the first `.env` file is ever created                                                               |

---

## 11. Interview Preparation

**Q: Why does Node.js support both CommonJS and ES Modules, and why would
you choose ESM for a new project?**

- _Concise answer_: CommonJS was Node's original module system before ES
  Modules were standardized in JavaScript itself; ESM is now the
  language-level standard, supports static analysis, and is what the
  ecosystem is converging on.
- _Detailed answer_: CommonJS (`require`/`module.exports`) is
  synchronous and resolved at runtime, which is why it was workable before
  JS had a native module system. ES Modules are part of the ECMAScript
  spec, resolved via static `import`/`export` declarations, which enables
  tooling (bundlers, linters) to analyze the dependency graph without
  executing code, and enables tree-shaking. Node added ESM support behind
  `"type": "module"` for backward compatibility with the vast CJS
  ecosystem; new projects choose ESM because it's forward-looking and
  because top-level `await` and stricter static structure are valuable.
- _What interviewers are evaluating_: whether you understand this is a
  deliberate architectural choice with real trade-offs (some older
  packages are CJS-only and need interop handling), not just a syntax
  preference.

**Q: What's the difference between `dependencies` and `devDependencies`,
and why does it matter operationally?**

- _Concise answer_: `dependencies` are needed at runtime;
  `devDependencies` only during development/build. Production installs can
  skip `devDependencies` entirely.
- _Detailed answer_: In a containerized deployment, running
  `npm ci --omit=dev` (or `NODE_ENV=production npm install`) excludes
  `devDependencies`, which reduces image size and attack surface (fewer
  installed packages = fewer potential vulnerabilities). Misclassifying a
  runtime dependency as a `devDependency` causes a working `npm run dev`
  locally but a broken production build — a classic "works on my machine"
  bug.
- _What interviewers are evaluating_: real production deployment experience
  versus purely local development experience.

**Q: Why enforce a folder structure at all — why not let it emerge
organically?**

- _Concise answer_: emergent structure reflects the order code was
  written, not a deliberate design, and becomes inconsistent and costly to
  refactor as the codebase grows.
- _Detailed answer_: Structure is cheapest to define before there's
  anything to migrate. A consistent structure also acts as documentation —
  a new engineer can infer where a piece of logic lives without asking,
  and code review can flag "this doesn't belong here" objectively instead
  of subjectively.
- _What interviewers are evaluating_: whether you've worked on a codebase
  long enough to have felt the pain of _not_ doing this, versus only ever
  greenfield prototyping.

---

## 12. Summary

### Key Takeaways

- Structural and tooling decisions are cheapest before any feature code
  exists — this feature is a deliberate, one-time investment.
- Feature-first (`modules/<domain>/`) beats layer-first for this project's
  scale trajectory, keeping related code co-located.
- Mechanical enforcement (ESLint + Prettier) replaces manual code-review
  nagging about style.

### Important Terminology

- **ES Modules (ESM)** vs. **CommonJS (CJS)** — the two Node.js module
  systems; this project commits to ESM.
- **Feature-first / module-first architecture** — organizing by domain
  concept rather than by technical layer.
- **Twelve-Factor App** — the methodology behind treating config as
  environment, not code.

### Design Principles

- Single Responsibility per folder (each folder answers one question about
  "what kind of thing lives here").
- Fail-fast tooling (lint/format checks) over convention-by-memory.

### Best Practices

- Commit the lockfile.
- Gitignore secrets and generated output before they can ever be created.
- Keep `devDependencies` and `dependencies` correctly classified.

---

## 13. Revision Notes (5-minute read)

- We use **ESM** (`"type": "module"`) everywhere — no `require()`.
- Folder philosophy: **feature-first** (`modules/auth`, `modules/users`,
  `modules/employees`) not layer-first — keeps related code co-located and
  makes future microservice extraction easier.
- `src/errors/`, `src/utils/`, `src/middlewares/` hold **cross-cutting**
  code shared by every module — never domain-specific logic.
- **ESLint** = correctness; **Prettier** = formatting; `eslint-config-
prettier` prevents them from fighting.
- `.env` is gitignored from commit #1; `.env.example` is committed and
  documents required keys with placeholder values only.
- `nodemon`/`eslint`/`prettier` are `devDependencies` — never shipped to
  production.

---

## 14. One-Line Interview Answers

**Q: Why ES Modules instead of CommonJS?**
A: ESM is the language-level standard, supports static analysis and
tree-shaking, and is where the Node ecosystem is converging.

**Q: Why feature-first folders instead of layer-first?**
A: It keeps everything about one domain concept co-located, so growing the
app doesn't mean jumping across four top-level folders to change one
feature.

**Q: Why run ESLint and Prettier together?**
A: ESLint owns correctness, Prettier owns formatting — separating the
concerns means they never conflict.

**Q: Why is `nodemon` a devDependency?**
A: It's a development-only convenience (auto-restart on file change) with
no role in a running production process.

**Q: Why commit `.env.example` but not `.env`?**
A: `.env.example` documents required configuration shape safely;
`.env` holds real secrets that must never enter source control.

---

## 15. Practical Examples From Our Codebase

Actual `package.json` scripts wired up in this feature:

```json
"scripts": {
  "start": "node src/server.js",
  "dev": "nodemon src/server.js",
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

Actual folder tree produced (excluding `node_modules/`, `.git/`):

```
.env.example
.gitignore
.prettierignore
.prettierrc.json
CLAUDE.md
eslint.config.js
package.json
handbook/
planning/
logs/.gitkeep
prisma/.gitkeep
src/
├── config/.gitkeep
├── docs/.gitkeep
├── errors/            (populated in Chapter 2)
├── middlewares/        (populated in Chapter 2)
├── modules/
│   ├── auth/.gitkeep
│   ├── employees/.gitkeep
│   └── users/.gitkeep
├── routes/             (populated in Chapter 2)
└── utils/              (populated in Chapter 2)
```

This is the exact skeleton every subsequent chapter builds inside of.
