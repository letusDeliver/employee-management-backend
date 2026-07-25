import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

/**
 * DISPOSABLE - a minimal stub so `/` is navigable during Feature 2, not a
 * 404. Replaced wholesale by the real LandingPageComponent in Feature 3
 * (blueprint §4.2); nothing here is meant to survive that replacement.
 */
@Component({
  selector: 'app-landing-page',
  imports: [RouterLink, MatButtonModule],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.scss',
})
export class LandingPageComponent {}
