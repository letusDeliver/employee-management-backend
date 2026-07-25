import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { AuthService } from '../../../core/auth/auth.service';
import { ICON_NAMES } from '../../../shared/icon-names';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';

@Component({
  selector: 'app-register-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './register-page.component.html',
  styleUrl: './register-page.component.scss',
})
export class RegisterPageComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly icons = ICON_NAMES;
  protected readonly hidePassword = signal(true);
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  // min(8) mirrors backend/src/modules/auth/auth.validation.js's registerSchema
  // exactly - immediate client-side feedback, never treated as the actual
  // authority (blueprint §9).
  protected readonly form = this.formBuilder.nonNullable.group({
    name: this.formBuilder.nonNullable.control('', [Validators.required]),
    email: this.formBuilder.nonNullable.control('', [Validators.required, Validators.email]),
    password: this.formBuilder.nonNullable.control('', [Validators.required, Validators.minLength(8)]),
  });

  protected togglePasswordVisibility(): void {
    this.hidePassword.update((hidden) => !hidden);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.serverError.set(null);

    this.authService.register(this.form.getRawValue()).subscribe({
      // replaceUrl: a successful registration should remove '/register'
      // from history, not leave it behind for the browser Back button to
      // return to.
      next: () => this.router.navigateByUrl('/dashboard', { replaceUrl: true }),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.serverError.set(extractErrorMessage(error, 'Unable to create your account. Please try again.'));
      },
    });
  }
}
