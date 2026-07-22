# Employee Management System

A full-stack Employee Management System, built as a guided, teaching-first
project — every feature on either side of the stack is designed with
theory and trade-offs explained first, then implemented and verified
against the real running system before moving on.

This is a monorepo: one shared git history for the backend, the frontend,
and the documentation that covers both.

## Repository Structure

```
backend/     # Node.js/Express API — Clean Architecture, PostgreSQL/Prisma, JWT auth, RBAC
frontend/    # Angular application (not yet created)
handbook/    # Shared developer guides — one deep-dive chapter per feature, either side of the stack
docs/        # Cross-cutting docs — architecture diagrams, ADRs, deployment notes, screenshots
```

## Where to Start

- **[`backend/README.md`](./backend/README.md)** — backend setup, tech
  stack, API endpoint table, and available scripts.
- **`frontend/README.md`** — frontend setup and scripts (added once the
  Angular project is scaffolded).
- **[`handbook/`](./handbook)** — the full per-feature write-ups (theory,
  architecture, security implications, common mistakes, interview prep)
  for every completed feature, backend and frontend alike.
- **[`backend/CLAUDE.md`](./backend/CLAUDE.md)** — the backend's running
  project context, architecture decisions, and feature progress log.
- **`frontend/CLAUDE.md`** — the frontend's equivalent (added once the
  Angular project is scaffolded).

## Roadmap

- [x] Backend: Features 1–13 (project setup through Swagger API docs) — see `backend/README.md`
- [x] Monorepo restructuring (`backend/`, `frontend/`, shared `handbook/`, `docs/`)
- [ ] Frontend: Angular project initialization
- [ ] Backend: Dockerization
- [ ] Backend: Testing strategy (unit/integration)
