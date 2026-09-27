import { FormControl, FormGroup } from '@angular/forms';

import { buildCycleCreate, buildCycleUpdate, endNotBeforeStartValidator } from './cycle-form';
import { cycle } from './performance.testing';

const local = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('cycle form', () => {
  it('creates with a trimmed name and LOCAL calendar dates', () => {
    expect(buildCycleCreate({ name: '  H1 2026 ', startDate: local(2026, 1, 1), endDate: local(2026, 6, 30), status: 'OPEN' })).toEqual({
      name: 'H1 2026',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    });
  });

  it('an edit sends ONLY what changed, and nothing when nothing did', () => {
    const original = cycle();
    const same = { name: 'H1 2026', startDate: local(2026, 1, 1), endDate: local(2026, 6, 30), status: 'OPEN' as const };

    expect(buildCycleUpdate(original, same)).toEqual({});
    expect(buildCycleUpdate(original, { ...same, status: 'CLOSED' })).toEqual({ status: 'CLOSED' });
    expect(buildCycleUpdate(original, { ...same, endDate: local(2026, 7, 31), name: 'H1+ 2026' })).toEqual({
      name: 'H1+ 2026',
      endDate: '2026-07-31',
    });
  });

  describe('end not before start', () => {
    const group = (start: Date | null, end: Date | null) => {
      const form = new FormGroup({
        startDate: new FormControl<Date | null>(start),
        endDate: new FormControl<Date | null>(end, endNotBeforeStartValidator),
      });
      // A control's validators first run before it joins its group (no parent yet) - re-run them, as the
      // dialog does whenever a date changes.
      form.controls.endDate.updateValueAndValidity();
      return form.controls.endDate;
    };

    it('rejects an end before the start', () => expect(group(local(2026, 6, 30), local(2026, 1, 1)).hasError('endBeforeStart')).toBe(true));
    it('accepts the same day, as the backend does', () => expect(group(local(2026, 1, 1), local(2026, 1, 1)).valid).toBe(true));
    it('says nothing while either date is missing', () => expect(group(null, local(2026, 1, 1)).valid).toBe(true));
  });
});
