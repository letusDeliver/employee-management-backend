import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { PublicFooterComponent } from './footer/public-footer.component';
import { PublicHeaderComponent } from './header/public-header.component';

/**
 * The unauthenticated chrome (blueprint §3) - hosts Landing (Feature 3),
 * Login, and Register. No sidebar, no breadcrumbs, no user menu, since
 * there is no session yet.
 */
@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, PublicHeaderComponent, PublicFooterComponent],
  templateUrl: './public-layout.component.html',
  styleUrl: './public-layout.component.scss',
})
export class PublicLayoutComponent {}
