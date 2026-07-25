import { Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { SessionStore } from '../../core/auth/session.store';
import { NAV_CONFIG } from '../../layout/shell/sidebar/nav-config';

/**
 * Real from Feature 2 onward (see docs/frontend-architecture-blueprint.md
 * §4.3, revision v5) - welcome message + profile summary card need nothing
 * but SessionStore, already built by this feature. Feature 3 adds the
 * quick-navigation cards (this same NAV_CONFIG the Sidebar reads, never a
 * second copy) and the reserved widgets region as template additions to
 * this same component - never a restructuring.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [MatCardModule, MatChipsModule, MatIconModule, RouterLink],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent {
  protected readonly sessionStore = inject(SessionStore);

  protected readonly visibleNavItems = computed(() =>
    NAV_CONFIG.filter(
      (item) => item.permissions.length === 0 || this.sessionStore.hasAnyPermission(...item.permissions),
    ),
  );
}
