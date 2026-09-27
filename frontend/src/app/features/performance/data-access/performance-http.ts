import { HttpContext } from '@angular/common/http';

import { SKIP_GLOBAL_ERROR_NOTIFICATION } from '../../../core/http/http-context-tokens';

/**
 * Every Performance screen renders its failure INLINE (dialog banner, table banner, the review page's
 * action banner), so no Performance request needs the global error toast - the same decision as
 * Attendance, Leave and Payroll.
 */
export const INLINE_ERROR = new HttpContext().set(SKIP_GLOBAL_ERROR_NOTIFICATION, true);
