import { HttpErrorResponse } from '@angular/common/http';

import { ApiError } from '../models/api-error.model';

/**
 * Every backend error response body is `{ status: 'error', message }`
 * (verified against `backend/src/middlewares/error.middleware.js`) - this
 * is the one place that shape gets read, shared by `errorInterceptor` (for
 * the global toast) and by Login/Register (for their inline banners).
 */
export const extractErrorMessage = (
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string => {
  if (error instanceof HttpErrorResponse) {
    const apiError = error.error as Partial<ApiError> | null;

    if (apiError?.message) {
      return apiError.message;
    }
  }

  return fallback;
};
