import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { ICON_NAMES } from '../../shared/icon-names';

interface FeatureHighlight {
  icon: string;
  title: string;
  description: string;
}

/**
 * Public, unauthenticated entry point (blueprint §4.2) - purely
 * presentational, no data-access layer, nothing to fetch.
 */
@Component({
  selector: 'app-landing-page',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.scss',
})
export class LandingPageComponent {
  protected readonly features: FeatureHighlight[] = [
    {
      icon: ICON_NAMES.people,
      title: 'Employee records',
      description: 'Keep every employee’s details, department, and role in one place.',
    },
    {
      icon: ICON_NAMES.security,
      title: 'Role-based access',
      description: 'Permissions decide what each person can see and do, down to the record level.',
    },
    {
      icon: ICON_NAMES.description,
      title: 'Document management',
      description: 'Attach and manage the documents tied to each employee record.',
    },
  ];
}
