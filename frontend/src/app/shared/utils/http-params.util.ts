import { HttpParams } from '@angular/common/http';

/**
 * Builds `HttpParams` from a typed filter object, skipping
 * undefined/null/empty-string values - every list feature builds its
 * query params the same way (blueprint §11). First real consumer:
 * Employees' `page`/`limit`/`search`/`department`/`jobTitle`/
 * `managerId`/`sortBy`/`order` set (Feature 6).
 */
export function toHttpParams(filters: object): HttpParams {
  let params = new HttpParams();

  for (const [key, value] of Object.entries(filters) as [string, string | number | undefined | null][]) {
    if (value !== undefined && value !== null && value !== '') {
      params = params.set(key, String(value));
    }
  }

  return params;
}
