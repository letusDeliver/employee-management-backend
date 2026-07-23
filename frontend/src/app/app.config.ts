import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';

// The interceptors array starts empty - authInterceptor/refreshInterceptor/
// errorInterceptor (blueprint §7) are added here as pure additions once the
// Auth feature builds them, never a restructuring of this file.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([])),
  ],
};
