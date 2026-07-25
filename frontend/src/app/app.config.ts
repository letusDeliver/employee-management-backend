import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { credentialsInterceptor } from './core/http/credentials.interceptor';
import { authInterceptor } from './core/http/auth.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { refreshInterceptor } from './core/http/refresh.interceptor';

// Order matters: Angular runs interceptors in this array order outbound,
// but in *reverse* order on the response/error path. refreshInterceptor is
// listed last (closest to the real HTTP call) specifically so it sees a 401
// before errorInterceptor does, letting it silently refresh+retry without
// errorInterceptor ever flashing a toast for an error refresh already
// recovered from. See core/http/error.interceptor.ts's own comment.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([credentialsInterceptor, authInterceptor, errorInterceptor, refreshInterceptor]),
    ),
  ],
};
