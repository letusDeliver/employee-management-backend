import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { SessionStore } from '../../../core/auth/session.store';
import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { MyPayslipsStore } from '../data-access/my-payslips.store';
import { MyPayslipsTableComponent } from './my-payslips-table.component';

/**
 * Routed at `/my-payslips`, open to every role (`payslip:read:own`). The store is provided HERE, so
 * every visit starts fresh.
 *
 * WHO "my" is: MANAGER and EMPLOYEE are scoped to themselves by the server. An ADMIN holds
 * `payslip:read:any`, so an unfiltered list would be everyone's pay: the page first resolves the
 * ADMIN's OWN employee record from the employee directory and hands its id to the store; with none it
 * shows "not linked" and fetches nothing, and a failed lookup blocks with a Retry - the
 * organisation's payslips must never appear under "My payslips".
 */
@Component({
  selector: 'app-my-payslips-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
    MyPayslipsTableComponent,
  ],
  providers: [MyPayslipsStore],
  templateUrl: './my-payslips-page.component.html',
  styleUrl: './my-payslips-page.component.scss',
})
export class MyPayslipsPageComponent implements OnInit {
  private readonly sessionStore = inject(SessionStore);
  private readonly employeeDirectory = inject(EmployeeDirectoryService);
  protected readonly store = inject(MyPayslipsStore);
  protected readonly icons = ICON_NAMES;

  /** Set when the caller can read everyone's payslips but their own employee could not be determined. */
  protected readonly ownerError = signal<string | null>(null);

  ngOnInit(): void {
    this.resolveOwner();
  }

  /** A caller with `payslip:read:any` needs their own employee id; everyone else is scoped by the server. */
  protected resolveOwner(): void {
    this.ownerError.set(null);

    if (!this.sessionStore.hasAnyPermission('payslip:read:any')) {
      this.store.start();
      return;
    }

    this.employeeDirectory.refresh().subscribe({
      next: () => {
        const ownId = this.employeeDirectory.ownEmployeeId(this.sessionStore.user()?.id);
        if (ownId) {
          this.store.start(ownId);
        } else {
          this.store.markNotLinked();
        }
      },
      error: () => this.ownerError.set("Couldn't work out which employee record is yours, so your payslips can't be shown."),
    });
  }

  protected onYearChange(year: number): void {
    this.store.selectYear(year);
  }
}
