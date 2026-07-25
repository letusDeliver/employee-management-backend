import { HttpContextToken } from '@angular/common/http';

/**
 * Set on a request (via `HttpContext`) to suppress `errorInterceptor`'s
 * global toast - used by forms that render the server's error message
 * inline instead (blueprint §9), so a failed submit never shows both an
 * inline banner and a duplicate toast for the same error.
 */
export const SKIP_GLOBAL_ERROR_NOTIFICATION = new HttpContextToken<boolean>(() => false);
