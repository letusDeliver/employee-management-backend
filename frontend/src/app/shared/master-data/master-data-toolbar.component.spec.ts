import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';

import { MasterDataFilters, MasterDataToolbarComponent } from './master-data-toolbar.component';

type ToolbarForm = FormGroup<{ search: FormControl<string>; status: FormControl<string> }>;

describe('MasterDataToolbarComponent', () => {
  let fixture: ComponentFixture<MasterDataToolbarComponent>;
  let emitted: MasterDataFilters[];

  // The form is `protected` - reach it the way the template does, via the instance.
  const form = () => (fixture.componentInstance as unknown as { form: ToolbarForm }).form;

  beforeEach(() => {
    vi.useFakeTimers();
    fixture = TestBed.createComponent(MasterDataToolbarComponent);
    emitted = [];
    fixture.componentInstance.filtersChange.subscribe((filters) => emitted.push(filters));
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('emits nothing on its own - only when a filter changes', () => {
    vi.advanceTimersByTime(1000);

    expect(emitted).toHaveLength(0);
  });

  it('debounces: nothing before 300ms, then one emission with the search text and no status', () => {
    form().controls.search.setValue('eng');

    vi.advanceTimersByTime(299);
    expect(emitted).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(emitted).toEqual([{ search: 'eng', status: undefined }]);
  });

  it('coalesces rapid typing into a single emission of the final value', () => {
    for (const text of ['e', 'en', 'eng']) {
      form().controls.search.setValue(text);
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(300);

    expect(emitted).toEqual([{ search: 'eng', status: undefined }]);
  });

  it('emits the chosen status, and undefined again for "All"', () => {
    form().controls.status.setValue('ACTIVE');
    vi.advanceTimersByTime(300);
    form().controls.status.setValue('');
    vi.advanceTimersByTime(300);

    expect(emitted).toEqual([
      { search: '', status: 'ACTIVE' },
      { search: '', status: undefined },
    ]);
  });
});
