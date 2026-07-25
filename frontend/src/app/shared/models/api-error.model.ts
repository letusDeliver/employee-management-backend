/**
 * The shape every backend error response body actually has - a single
 * joined message string, not per-field fragments (see
 * `backend/src/middlewares/error.middleware.js`). Forms show this string
 * as one banner on submit failure; they never try to split it and assign
 * fragments to individual controls, since the backend doesn't guarantee
 * a parseable format (blueprint §9).
 */
export interface ApiError {
  status: 'error';
  message: string;
  /** Only present outside production (`NODE_ENV !== 'production'`) - never rendered to the user. */
  stack?: string;
}
