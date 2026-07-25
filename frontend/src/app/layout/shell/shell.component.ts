import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { map } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { SessionStore } from '../../core/auth/session.store';
import { BreadcrumbsComponent } from './breadcrumbs/breadcrumbs.component';
import { FooterComponent } from './footer/footer.component';
import { HeaderComponent } from './header/header.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { NAV_CONFIG } from './sidebar/nav-config';

/**
 * The authenticated chrome (blueprint §3) - structurally final as of this
 * feature (see docs/frontend-architecture-blueprint.md §3, revision v5).
 * Sidebar/Header grow by NAV_CONFIG entries / menu items in later features,
 * never by restructuring this component.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, MatSidenavModule, HeaderComponent, SidebarComponent, BreadcrumbsComponent, FooterComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly sessionStore = inject(SessionStore);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly breakpointObserver = inject(BreakpointObserver);

  protected readonly user = this.sessionStore.user;

  protected readonly sidebarItems = computed(() =>
    NAV_CONFIG.filter(
      (item) => item.permissions.length === 0 || this.sessionStore.hasAnyPermission(...item.permissions),
    ),
  );

  protected readonly isHandset = toSignal(
    this.breakpointObserver.observe(Breakpoints.Handset).pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  protected logout(): void {
    this.authService.logout().subscribe({
      next: () => this.router.navigateByUrl('/login'),
      error: () => this.router.navigateByUrl('/login'),
    });
  }
}
