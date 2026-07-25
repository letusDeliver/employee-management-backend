import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';

import { SessionStore } from '../../core/auth/session.store';

/**
 * Real from Feature 2 onward (see docs/frontend-architecture-blueprint.md
 * §4.3, revision v5) - welcome message + profile summary card need nothing
 * but SessionStore, already built by this feature. Feature 3 adds the
 * quick-navigation cards and the reserved widgets region as template
 * additions to this same component - never a restructuring.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [MatCardModule, MatChipsModule],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent {
  protected readonly sessionStore = inject(SessionStore);
}
