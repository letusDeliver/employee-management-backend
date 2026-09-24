import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';

import { DirectoryEntry } from '../../../core/master-data-directory/master-data-directory';
import { EmployeeFilters, EmployeeToolbarComponent } from './employee-toolbar.component';

type ToolbarForm = FormGroup<{
  search: FormControl<string>;
  departmentId: FormControl<string>;
  designationId: FormControl<string>;
  employmentType: FormControl<string>;
}>;

const entry = (id: string, name: string, status: DirectoryEntry['status'] = 'ACTIVE'): DirectoryEntry => ({ id, name, status });

describe('EmployeeToolbarComponent', () => {
  let fixture: ComponentFixture<EmployeeToolbarComponent>;
  let emitted: EmployeeFilters[];

  // The form is `protected` - reach it the way the template does, via the instance.
  const form = () => (fixture.componentInstance as unknown as { form: ToolbarForm }).form;

  beforeEach(() => {
    vi.useFakeTimers();
    fixture = TestBed.createComponent(EmployeeToolbarComponent);
    emitted = [];
    fixture.componentInstance.filtersChange.subscribe((filters) => emitted.push(filters));
    fixture.componentRef.setInput('departments', [entry('dep-1', 'Engineering'), entry('dep-2', 'Legacy Ops', 'INACTIVE')]);
    fixture.componentRef.setInput('designations', [entry('des-1', 'Backend Engineer')]);
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('emits nothing on its own - only when a filter changes', () => {
    vi.advanceTimersByTime(1000);

    expect(emitted).toHaveLength(0);
  });

  it('sends departmentId / designationId / employmentType - the backend\'s real filter keys, not free text', () => {
    form().controls.departmentId.setValue('dep-1');
    form().controls.designationId.setValue('des-1');
    form().controls.employmentType.setValue('CONTRACT');
    vi.advanceTimersByTime(300);

    expect(emitted).toEqual([
      { search: '', departmentId: 'dep-1', designationId: 'des-1', employmentType: 'CONTRACT' },
    ]);
    expect(Object.keys(emitted[0])).not.toContain('department');
    expect(Object.keys(emitted[0])).not.toContain('jobTitle');
  });

  it('maps "All" (the empty string) to an absent key, so the query never carries an empty filter', () => {
    form().controls.departmentId.setValue('dep-1');
    vi.advanceTimersByTime(300);
    form().controls.departmentId.setValue('');
    vi.advanceTimersByTime(300);

    expect(emitted[1]).toEqual({ search: '', departmentId: undefined, designationId: undefined, employmentType: undefined });
  });

  it('debounces search: nothing before 300ms, then one emission of the final text', () => {
    for (const text of ['j', 'ja', 'jane']) {
      form().controls.search.setValue(text);
      vi.advanceTimersByTime(100);
    }
    expect(emitted).toHaveLength(0);

    vi.advanceTimersByTime(300);
    expect(emitted).toEqual([{ search: 'jane', departmentId: undefined, designationId: undefined, employmentType: undefined }]);
  });

  it('offers every department - INACTIVE ones included and marked, since employees still belong to them', () => {
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('mat-select')[0].click();
    fixture.detectChanges();

    const options = [...document.querySelectorAll('mat-option')].map((option) => (option.textContent ?? '').replace(/\s+/g, ' ').trim());

    expect(options).toEqual(['All', 'Engineering', 'Legacy Ops (inactive)']);
  });
});
