import { Component, computed, inject, input } from '@angular/core';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';

/**
 * An employee in a table cell: the directory's label and, only for an employee with no resolvable
 * name (every employee to a MANAGER, who cannot list users), a second "Joined ..." line - the label
 * alone ("Engineer, Sales") would be the same on many rows. Presentational; the page that shows
 * it loads the directory (`refresh()`), and until that loads or when it fails a row reads
 * "Unknown employee" and nothing else breaks. Extracted from Attendance's table when Leave became
 * the second consumer.
 */
@Component({
  selector: 'app-employee-cell',
  template: `
    {{ label() }}
    @if (detail(); as text) {
      <span class="ds-caption employee-detail">{{ text }}</span>
    }
  `,
  styles: `
    .employee-detail {
      display: block;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class EmployeeCellComponent {
  private readonly directory = inject(EmployeeDirectoryService);

  readonly employeeId = input.required<string | null>();

  protected readonly label = computed(() => this.directory.labelOf(this.employeeId()));
  protected readonly detail = computed(() =>
    this.directory.personNameOf(this.employeeId()) === null ? this.directory.detailOf(this.employeeId()) : null,
  );
}
