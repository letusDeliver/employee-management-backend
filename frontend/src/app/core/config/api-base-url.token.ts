import { InjectionToken } from '@angular/core';

import { environment } from '../../../environments/environment';

/**
 * The one place environment.ts/environment.development.ts is read.
 * Every other file injects this token instead of importing `environment`
 * directly - mirrors the backend's rule that env.js is the only file
 * allowed to read process.env.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiBaseUrl,
});
