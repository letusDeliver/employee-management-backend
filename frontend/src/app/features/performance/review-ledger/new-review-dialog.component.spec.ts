import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { cycle, review } from '../data-access/performance.testing';
import { ReviewContext } from '../data-access/review-context';
import { ReviewCycleLookup } from '../data-access/review-cycle-lookup';
import { NewReviewDialogComponent } from './new-review-dialog.component';

describe('NewReviewDialogComponent', () => {
  const store = { create: vi.fn() };
  const dialogRef = { close: vi.fn() };
  // e-emp reports to e-mgr; e-other has no manager.
  const managers: Record<string, string | null> = { 'e-emp': 'e-mgr', 'e-other': null, 'e-mgr': null };
  const directory = {
    refresh: vi.fn(() => of([])),
    managerIdOf: (id: string) => managers[id],
    entries: signal(Object.keys(managers).map((id) => ({ id }))),
    options: signal(Object.keys(managers).map((id) => ({ id, label: id, detail: '' }))),
    loaded: signal(true),
    loading: signal(false),
    error: signal<string | null>(null),
    labelOf: (id: string) => id,
  };
  const lookup = { refresh: vi.fn(() => of([])), open: signal([cycle()]), loading: signal(false), error: signal<string | null>(null) };

  const setup = (createAny: boolean, own: string | null, ownState: 'known' | 'failed' = 'known') => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { store, createAny } },
        { provide: EmployeeDirectoryService, useValue: directory },
        { provide: ReviewCycleLookup, useValue: lookup },
        { provide: ReviewContext, useValue: { ownEmployeeId: signal(own), ownState: signal(ownState), load: () => of(undefined) } },
      ],
    });
    const fixture = TestBed.createComponent(NewReviewDialogComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance as unknown as Record<string, unknown>, el: fixture.nativeElement as HTMLElement };
  };
  const form = (component: Record<string, unknown>) =>
    component['form'] as { controls: Record<string, { setValue: (v: unknown) => void; valid: boolean }>; valid: boolean };

  beforeEach(() => {
    store.create.mockReset().mockReturnValue(of(review()));
    dialogRef.close.mockReset();
  });

  it("a MANAGER's picker is narrowed to their DIRECT REPORTS, and no reviewer field ever appears", () => {
    const { component } = setup(false, 'e-mgr');
    const include = component['include'] as (id: string) => boolean;

    expect(['e-emp', 'e-other', 'e-mgr'].filter(include)).toEqual(['e-emp']);
  });

  it('an ADMIN sees everyone; a Reviewer becomes REQUIRED only for an employee with no manager', () => {
    const { fixture, component, el } = setup(true, null);
    expect(component['include']).toBeNull();

    form(component).controls['employeeId'].setValue('e-emp');
    fixture.detectChanges();
    expect(el.textContent).not.toContain('This employee has no manager');
    expect(form(component).controls['reviewerId'].valid).toBe(true);

    form(component).controls['employeeId'].setValue('e-other');
    fixture.detectChanges();
    expect(el.textContent).toContain('This employee has no manager, so choose who writes the review.');
    expect(form(component).controls['reviewerId'].valid).toBe(false);
  });

  it('sends the reviewer only when it is needed', () => {
    const { fixture, component } = setup(true, null);
    form(component).controls['reviewCycleId'].setValue('c-1');
    form(component).controls['employeeId'].setValue('e-other');
    form(component).controls['reviewerId'].setValue('e-mgr');
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));

    expect(store.create).toHaveBeenCalledWith({ employeeId: 'e-other', reviewCycleId: 'c-1', reviewerId: 'e-mgr' });
    expect(dialogRef.close).toHaveBeenCalledWith(review());
  });

  it('drops a chosen reviewer when the employee changes to one who has a manager', () => {
    const { fixture, component } = setup(true, null);
    form(component).controls['reviewCycleId'].setValue('c-1');
    form(component).controls['employeeId'].setValue('e-other');
    form(component).controls['reviewerId'].setValue('e-mgr');
    form(component).controls['employeeId'].setValue('e-emp');
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));

    expect(store.create).toHaveBeenCalledWith({ employeeId: 'e-emp', reviewCycleId: 'c-1' });
  });

  it('a MANAGER nobody reports to is told so', () => {
    const { el } = setup(false, 'e-other');
    expect(el.textContent).toContain('Nobody reports to you');
  });

  it("blocks - rather than guessing - when a MANAGER's own record could not be determined", () => {
    const { el } = setup(false, null, 'failed');
    expect(el.textContent).toContain("Couldn't work out who reports to you");
    expect((el.querySelector('button[type=submit]') as HTMLButtonElement).disabled).toBe(true);
  });
});
