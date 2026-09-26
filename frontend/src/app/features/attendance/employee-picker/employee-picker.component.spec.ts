import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';

import { EmployeeDirectoryService, EmployeeOption } from '../../../core/employee-directory/employee-directory.service';
import { EmployeePickerComponent } from './employee-picker.component';

@Component({
  imports: [EmployeePickerComponent, ReactiveFormsModule],
  template: `<app-employee-picker [formControl]="control" label="Employee" [required]="required" />`,
})
class HostComponent {
  control = new FormControl<string | null>(null);
  required = false;
}

const options: EmployeeOption[] = [
  { id: 'e-amit', label: 'Amit Rao', detail: 'Joined Jan 5, 2024' },
  { id: 'e-priya', label: 'Priya Sharma', detail: 'Joined Feb 1, 2023' },
  { id: 'e-twin-1', label: 'Engineer, Sales', detail: 'Joined Mar 1, 2022' },
  { id: 'e-twin-2', label: 'Engineer, Sales', detail: 'Joined Aug 1, 2025' },
];

describe('EmployeePickerComponent', () => {
  const directory = {
    options: signal<EmployeeOption[]>(options),
    loading: signal(false),
    error: signal<string | null>(null),
    labelOf: (id: string | null) => options.find((o) => o.id === id)?.label ?? 'Unknown employee',
    refresh: vi.fn(() => of([])),
  };

  const setup = (required = false): { fixture: ComponentFixture<HostComponent>; host: HostComponent; el: HTMLElement } => {
    TestBed.configureTestingModule({ providers: [{ provide: EmployeeDirectoryService, useValue: directory }] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.required = required;
    fixture.detectChanges();
    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  };

  const input = (el: HTMLElement) => el.querySelector('input') as HTMLInputElement;
  // "label | detail" for a real option (two blocks in the DOM), the plain text for a message option.
  const optionTexts = () =>
    [...document.querySelectorAll('mat-option')].map((o) => {
      const label = o.querySelector('.option-label')?.textContent?.trim();
      const detail = o.querySelector('.option-detail')?.textContent?.trim();
      return label ? `${label} | ${detail}` : (o.textContent ?? '').replace(/\s+/g, ' ').trim();
    });
  const open = (fixture: ComponentFixture<HostComponent>, el: HTMLElement) => {
    input(el).dispatchEvent(new Event('focusin'));
    fixture.detectChanges();
  };
  const type = (fixture: ComponentFixture<HostComponent>, el: HTMLElement, text: string) => {
    input(el).value = text;
    input(el).dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    directory.options.set(options);
    directory.loading.set(false);
    directory.error.set(null);
    directory.refresh.mockClear();
  });

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
  });

  it("shows the label of the form's current value, never the raw id", () => {
    const { fixture, host, el } = setup();
    host.control.setValue('e-priya');
    fixture.detectChanges();

    expect(input(el).value).toBe('Priya Sharma');
  });

  it('lists every employee on focus, each with its joining date', () => {
    const { fixture, el } = setup();
    open(fixture, el);

    expect(optionTexts()).toEqual([
      'Amit Rao | Joined Jan 5, 2024',
      'Priya Sharma | Joined Feb 1, 2023',
      'Engineer, Sales | Joined Mar 1, 2022',
      'Engineer, Sales | Joined Aug 1, 2025',
    ]);
  });

  it('filters by what is typed, matching the label AND the joining detail', () => {
    const { fixture, el } = setup();
    open(fixture, el);

    type(fixture, el, 'priya');
    expect(optionTexts()).toEqual(['Priya Sharma | Joined Feb 1, 2023']);

    type(fixture, el, '2025');
    expect(optionTexts()).toEqual(['Engineer, Sales | Joined Aug 1, 2025']);
  });

  it('says so when nothing matches', () => {
    const { fixture, el } = setup();
    open(fixture, el);

    type(fixture, el, 'zzzz');
    expect(optionTexts()).toEqual(['No employee matches.']);
  });

  it("sets the control to the chosen employee's id and shows the label", () => {
    const { fixture, host, el } = setup();
    open(fixture, el);

    (document.querySelectorAll('mat-option')[1] as HTMLElement).click();
    fixture.detectChanges();

    expect(host.control.value).toBe('e-priya');
    expect(input(el).value).toBe('Priya Sharma');
  });

  it('drops the value as soon as the user edits the text after choosing', () => {
    const { fixture, host, el } = setup();
    host.control.setValue('e-priya');
    fixture.detectChanges();

    type(fixture, el, 'Priy');

    expect(host.control.value).toBeNull();
  });

  it('never accepts unmatched text as a value, and says so once touched', () => {
    const { fixture, host, el } = setup();
    type(fixture, el, 'nobody here');
    input(el).dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(host.control.value).toBeNull();
    expect(el.textContent).toContain('Pick an employee from the list.');
  });

  it('is silent about an empty optional field, and asks for a selection on an empty required one', () => {
    const optional = setup(false);
    input(optional.el).dispatchEvent(new Event('blur'));
    optional.fixture.detectChanges();
    expect(optional.el.textContent).not.toContain('Select an employee.');

    TestBed.resetTestingModule();

    const required = setup(true);
    expect(required.el.textContent).not.toContain('Select an employee.'); // not before it is touched
    input(required.el).dispatchEvent(new Event('blur'));
    required.fixture.detectChanges();
    expect(required.el.textContent).toContain('Select an employee.');
  });

  it('clears the value with the clear button', () => {
    const { fixture, host, el } = setup();
    host.control.setValue('e-amit');
    fixture.detectChanges();

    (el.querySelector('button[aria-label="Clear employee"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(host.control.value).toBeNull();
    expect(input(el).value).toBe('');
  });

  it('is disabled with the reason and a Retry when the employees could not be loaded', () => {
    directory.error.set('boom');
    const { fixture, el } = setup();

    expect(input(el).disabled).toBe(true);
    expect(el.textContent).toContain("Couldn't load employees: boom");

    (el.querySelector('p button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(directory.refresh).toHaveBeenCalledTimes(1);
  });

  it('is disabled while the employees are loading, and says so', () => {
    directory.loading.set(true);
    const { el } = setup();

    expect(input(el).disabled).toBe(true);
    expect(el.textContent).toContain('Loading employees...');
  });

  it("follows the form's disabled state", () => {
    const { fixture, host, el } = setup();
    host.control.disable();
    fixture.detectChanges();

    expect(input(el).disabled).toBe(true);
  });

  it('caps a long list and says to keep typing', () => {
    directory.options.set(Array.from({ length: 130 }, (_, i) => ({ id: `e-${i}`, label: `Person ${i}`, detail: 'Joined Jan 1, 2024' })));
    const { fixture, el } = setup();
    open(fixture, el);

    const texts = optionTexts();
    expect(texts.filter((t) => t.startsWith('Person'))).toHaveLength(100);
    expect(texts[texts.length - 1]).toContain('keep typing');
  });
});
