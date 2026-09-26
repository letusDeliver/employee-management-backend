import { HttpContext } from '@angular/common/http';

import { SKIP_GLOBAL_ERROR_NOTIFICATION } from '../../../core/http/http-context-tokens';

/**
 * Every Leave screen renders its failure INLINE (dialog banner, table banner, the page's action
 * banner), so no Leave request needs the global error toast, which would only repeat the message a
 * second time - the same decision as Attendance's service.
 */
export const INLINE_ERROR = new HttpContext().set(SKIP_GLOBAL_ERROR_NOTIFICATION, true);
