/**
 * The one genuinely reusable response-shape piece in this app
 * (blueprint §8) - every real paginated list endpoint returns its own
 * array under its own key (`employees`, future `documents`, etc.) as a
 * sibling of this exact metadata shape, never nested inside it. First
 * real consumer: Employees (Feature 6).
 */
export interface Paginated {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
