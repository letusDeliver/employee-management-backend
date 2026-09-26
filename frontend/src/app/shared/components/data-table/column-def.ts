export interface ColumnDef {
  key: string;
  header: string;
  sortable?: boolean;
  /** Keep the header on one line (a short label such as "Check in" must not wrap). */
  nowrap?: boolean;
  /**
   * Pin the column to the right edge, so a narrow screen that still has to scroll sideways keeps it in
   * reach - meant for a row-actions column (Edit / Delete), as `HolidayTableComponent` does.
   */
  stickyEnd?: boolean;
}
