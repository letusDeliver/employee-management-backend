# Employee Management App — Frontend

The Angular frontend for the Employee Management System — built
feature by feature against the real backend API, following
[`docs/frontend-architecture-blueprint.md`](../docs/frontend-architecture-blueprint.md)
(the architecture constitution) and
[`CLAUDE.md`](./CLAUDE.md) (the running feature progress log and
8-phase development workflow).

## Tech Stack

- **Framework**: Angular 21 (standalone APIs, no NgModules)
- **Language**: TypeScript, strict mode
- **State**: Signals + `computed()` (feature Stores are plain signal-based
  services — **not** NgRx)
- **Styling**: SCSS composition root + Angular Material 3 (custom theme)
  + Tailwind CSS v4, one `_tokens.scss` design-token source of truth
- **Forms**: Typed Reactive Forms
- **Linting**: ESLint (`@angular-eslint`)
- **Formatting**: Prettier
- **Testing**: Vitest
- **Package manager**: npm

## Getting Started

### Prerequisites

- Node.js `^20.19.0 || ^22.12.0 || >=24.0.0` (Angular 21's requirement —
  confirmed against the installed `v22.22.1`)
- The backend running locally (see
  [`../backend/README.md`](../backend/README.md)) — this app's dev
  configuration expects it at `http://localhost:3000/api/v1`

### Setup

```bash
cd frontend
npm install
npm start
```

The dev server boots on `http://localhost:4200` — matching the
backend's already-configured `CORS_ORIGIN` default.

### Available Scripts

| Script          | Purpose                                             |
| --------------- | ---------------------------------------------------- |
| `npm start`     | `ng serve` — dev server with hot reload               |
| `npm run build` | Production build (`ng build`, budgets enforced)      |
| `npm run watch` | Development-configuration build, rebuilds on change   |
| `npm test`      | Run the Vitest test suite                             |
| `npm run lint`  | Run ESLint (`ng lint`)                                 |

## Dependency Baseline

A `npm audit` / `npm outdated` baseline was captured immediately after
Feature 0's scaffold — see `CLAUDE.md`'s Progress Log for the full
detail. Summary: 3 moderate-severity advisories, all in a dev-tooling-
only dependency chain (`@angular/cli`'s new bundled MCP-server support →
`@hono/node-server`, a Windows path-traversal issue) — nothing here
ships in the built application, and no upgrade was applied since nothing
blocks setup. A handful of packages have newer versions available
(`angular-eslint`, `jsdom`, `typescript`, `typescript-eslint`) — also
recorded, not acted on.

## Project Structure

```
src/
├── app/
│   ├── app.config.ts, app.routes.ts, app.component.ts   # bootstrap shell only
│   ├── core/           # singleton app-wide services — auth, http, error-handling, logging, config
│   ├── shared/         # stateless, reusable — components, directives, pipes, validators, models, utils
│   ├── layout/          # visual chrome — public-layout (landing/login/register), shell (authenticated)
│   └── features/       # one folder per domain module, lazy-loaded, added one at a time
├── environments/        # environment.ts (production), environment.development.ts (dev)
├── styles/
│   ├── _theme-colors.scss    # generated M3 palette (ng generate @angular/material:m3-theme)
│   ├── _material-theme.scss  # mat.theme() — color, typography, density
│   └── _tokens.scss          # semantic color aliases + spacing/radius/elevation scale
└── styles.scss                # composition root — theme + Tailwind @theme block
```

Most of this is currently empty scaffolding (`.gitkeep`-marked) — see
`CLAUDE.md`'s Progress Log for exactly what has real content so far.

## Documentation

- **[`CLAUDE.md`](./CLAUDE.md)** — the frontend's engineering
  constitution: mentor stance, the 8-phase feature workflow, tech
  stack, naming convention, and the running Progress Log.
- **[`../docs/frontend-architecture-blueprint.md`](../docs/frontend-architecture-blueprint.md)**
  — the full architecture: layering, routing, state management,
  authentication, API layer, UI architecture, naming conventions,
  styling, accessibility, performance, and the Feature Lifecycle/
  Definition of Done every feature follows.
- **[`../handbook/`](../handbook)** — one deep-dive chapter per
  completed feature (shared with the backend).

## Roadmap

- [x] Feature 0 — Angular project scaffolding, tooling, environments, folder skeleton
- [x] Feature 1 — Angular Material, Tailwind CSS, theming, design tokens, design system
- [ ] Landing Page, Authentication, Dashboard, Employees, Users, Account (order TBD)
