// Development configuration - swapped in for `ng serve` and
// `ng build --configuration development` via the fileReplacements entry
// `ng generate environments` added to angular.json.
//
// Matches the backend's real dev server (backend/src/config/env.js
// defaults PORT to 3000, and CORS_ORIGIN to http://localhost:4200 - this
// app's own default `ng serve` port, already anticipated on that side).
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api/v1',
};
