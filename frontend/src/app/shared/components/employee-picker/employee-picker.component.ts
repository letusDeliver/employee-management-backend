import { AfterViewInit, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, NgControl, TouchedChangeEvent } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { filter } from 'rxjs';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { ICON_NAMES } from '../../icon-names';

// A long list is filtered by typing; rendering hundreds of options at once helps nobody.
const MAX_OPTIONS = 100;

/**
 * Picks one employee from `EmployeeDirectoryService` by typing part of a label (name, or
 * "Designation, Department") and choosing from the list. A `ControlValueAccessor` whose value is the
 * employee id (`string | null`), so a dialog validates it like any other field
 * (`Validators.required`, `touched`) and the toolbar filter binds it the same way.
 *
 * Only a CHOSEN option is a value: text that matches nothing leaves the value `null`, and the field
 * says so once touched instead of quietly ignoring what was typed. The directory is NOT loaded here -
 * the page or dialog that owns the field calls `refresh()` on entry, so a page that shows several
 * pickers (or none, until a dialog opens) decides when the load happens.
 *
 * Lives in `shared/` since Leave became its second consumer (it began in `features/attendance`).
 */
@Component({
  selector: 'app-employee-picker',
  imports: [MatAutocompleteModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './employee-picker.component.html',
  styleUrl: './employee-picker.component.scss',
})
export class EmployeePickerComponent implements ControlValueAccessor, AfterViewInit {
  readonly label = input('Employee');
  readonly required = input(false);

  protected readonly directory = inject(EmployeeDirectoryService);
  protected readonly icons = ICON_NAMES;

  // Injected instead of providing NG_VALUE_ACCESSOR: the picker has to read the CONTROL's own
  // touched state, because a form's `markAllAsTouched()` (a failed submit) never calls `onTouched`
  // on the accessor - without it the field would stay silent while the submit button went disabled.
  private readonly ngControl = inject(NgControl, { self: true, optional: true });
  private readonly destroyRef = inject(DestroyRef);

  private readonly selectedId = signal<string | null>(null);
  /** What the user has typed since the last selection; `null` = show the selected employee's label. */
  private readonly typed = signal<string | null>(null);
  private readonly touched = signal(false);
  private readonly disabledByForm = signal(false);

  protected readonly disabled = computed(
    () => this.disabledByForm() || this.directory.loading() || this.directory.error() !== null,
  );

  protected readonly display = computed(() => {
    const typed = this.typed();
    if (typed !== null) {
      return typed;
    }
    const id = this.selectedId();
    return id ? this.directory.labelOf(id) : '';
  });

  private readonly matching = computed(() => {
    const query = (this.typed() ?? '').trim().toLowerCase();
    const options = this.directory.options();
    return query ? options.filter((option) => `${option.label} ${option.detail}`.toLowerCase().includes(query)) : options;
  });

  protected readonly visible = computed(() => this.matching().slice(0, MAX_OPTIONS));
  protected readonly hasMore = computed(() => this.matching().length > MAX_OPTIONS);

  /** Shown once touched: what is wrong with the field right now, or `null`. */
  protected readonly problem = computed(() => {
    if (!this.touched() || this.selectedId() !== null) {
      return null;
    }
    if (this.typed()) {
      return 'Pick an employee from the list.';
    }
    return this.required() ? 'Select an employee.' : null;
  });

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  // The control is only bound to its directive once the parent has run its bindings, which is after
  // this component's own constructor and ngOnInit - so it is read here.
  ngAfterViewInit(): void {
    const control = this.ngControl?.control;
    if (!control) {
      return;
    }

    if (control.touched) {
      this.touched.set(true);
    }

    control.events
      .pipe(
        filter((event): event is TouchedChangeEvent => event instanceof TouchedChangeEvent),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => this.touched.set(event.touched));
  }

  protected readonly displayOption = (id: string | null): string => (id ? this.directory.labelOf(id) : '');

  writeValue(value: string | null): void {
    this.selectedId.set(value);
    this.typed.set(null);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledByForm.set(isDisabled);
  }

  protected onInput(text: string): void {
    this.typed.set(text);
    if (this.selectedId() !== null) {
      this.selectedId.set(null);
      this.onChange(null);
    }
  }

  protected onSelect(id: string): void {
    this.selectedId.set(id);
    this.typed.set(null);
    this.onChange(id);
  }

  protected clear(): void {
    this.selectedId.set(null);
    this.typed.set(null);
    this.onChange(null);
    this.markTouched();
  }

  protected markTouched(): void {
    this.touched.set(true);
    this.onTouched();
  }

  protected retry(): void {
    this.directory.refresh().subscribe({ error: () => undefined });
  }
}
