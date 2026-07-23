// Production configuration. Used as-is by `ng build` (no file replacement
// configured for the production configuration - `environment.development.ts`
// is what gets swapped in for `ng serve`/`ng build --configuration development`).
//
// apiBaseUrl is a relative path, assuming the built frontend is served from
// the same origin as the API in production. No production hosting/Docker
// strategy has been decided yet (see backend/CLAUDE.md roadmap) - revisit
// this the moment that changes, e.g. if the API ends up on a separate origin.
export const environment = {
  production: true,
  apiBaseUrl: '/api/v1',
};
