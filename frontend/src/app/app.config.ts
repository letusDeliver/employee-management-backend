import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';

import { routes } from './app.routes';
import { credentialsInterceptor } from './core/http/credentials.interceptor';
import { authInterceptor } from './core/http/auth.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { refreshInterceptor } from './core/http/refresh.interceptor';

// Order matters: Angular runs interceptors in this array order outbound,
// but in *reverse* order on the response/error path. refreshInterceptor is
// listed last (closest to the real HTTP call) specifically so it sees a 401
// before errorInterceptor does, letting it silently refresh+retry without
// errorInterceptor ever flashing a toast for an error refresh already
// recovered from. See core/http/error.interceptor.ts's own comment.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([credentialsInterceptor, authInterceptor, errorInterceptor, refreshInterceptor]),
    ),
    // index.html loads the "Material Symbols Outlined" web font, but
    // MatIconModule's own default fontSet is the classic "Material Icons"
    // font, which was never loaded - every <mat-icon> was rendering its
    // ligature text literally (clipped by the icon's fixed-size box)
    // instead of resolving to a glyph. One global default fixes every
    // <mat-icon> in the app instead of a per-component fontSet override.
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
    // No Angular animations provider existed anywhere until Feature 6 -
    // MatMenu/MatSnackBar degraded to instant, un-animated transitions
    // silently (no error, easy to miss). MatDialog (this feature's
    // ConfirmDialogComponent) leans on animation lifecycle more heavily,
    // which is what surfaced this while verifying live.
    provideAnimationsAsync(),
    // MatDatepicker (the employee form's dateOfJoining field) needs a
    // DateAdapter - native Date objects are already this app's domain
    // model type (employee.model.ts), so no extra date library is
    // introduced just to satisfy this.
    provideNativeDateAdapter(),
    // Real bug, found live while verifying Employees' form (Feature 6):
    // the theme's compact density (-2, chosen in Feature 1 for chips'
    // tightest clamp) sets `--mat-form-field-filled-label-display: none`
    // at this density - Material's own default "filled" appearance
    // silently renders NO label at all, not a color/contrast issue. This
    // had been present since Feature 5 (Users' unlabeled search box)
    // and possibly earlier, just not visually obvious until a 6-field
    // form made it impossible to miss. "outline" has no equivalent
    // density-driven label-hiding rule (confirmed against the compiled
    // CSS) - one global default fixes every <mat-form-field> in the app
    // instead of an `appearance="outline"` attribute repeated on every
    // usage (Login/Register already set it explicitly per-instance,
    // harmlessly redundant with this default now).
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline' } },
  ],
};
