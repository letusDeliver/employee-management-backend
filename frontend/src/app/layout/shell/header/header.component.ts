import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';

import { AuthUser } from '../../../core/auth/auth.models';
import { ICON_NAMES } from '../../../shared/icon-names';

@Component({
  selector: 'app-header',
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule, RouterLink],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  readonly user = input<AuthUser | null>(null);
  readonly menuToggle = output<void>();
  readonly logout = output<void>();

  protected readonly icons = ICON_NAMES;
}
