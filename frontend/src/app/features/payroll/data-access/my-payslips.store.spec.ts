import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { MyPayslipsStore } from './my-payslips.store';
import { pageOf, payslip } from './payroll.testing';
import { PayslipService } from './payslip.service';

describe('MyPayslipsStore', () => {
  const api = { list: vi.fn() };
  let store: MyPayslipsStore;

  beforeEach(() => {
    api.list.mockReset().mockReturnValue(of(pageOf([payslip()], 1, 100)));
    TestBed.configureTestingModule({ providers: [MyPayslipsStore, { provide: PayslipService, useValue: api }] });
    store = TestBed.inject(MyPayslipsStore);
  });

  describe('whose payslips (the crux for an ADMIN, who holds payslip:read:any)', () => {
    it('sends NO employee id for a caller the server scopes (MANAGER, EMPLOYEE)', () => {
      store.start();
      expect(api.list.mock.calls[0][0].employeeId).toBeUndefined();
    });

    it("sends the caller's OWN employee id when given one - or an ADMIN would see everyone's pay", () => {
      store.start('e-me');
      expect(api.list.mock.calls[0][0].employeeId).toBe('e-me');
    });

    it('fetches nothing when not linked', () => {
      store.markNotLinked();
      expect(store.notLinked()).toBe(true);
      expect(api.list).not.toHaveBeenCalled();
    });
  });

  it('pages through EVERY page (100 at a time) and orders newest period first - the server cannot', () => {
    const p = (id: string, periodYear: number, periodMonth: number) => payslip({ id, periodYear, periodMonth });
    api.list
      .mockReturnValueOnce(of({ items: [p('a', 2025, 12), p('b', 2026, 3)], pagination: { page: 1, limit: 100, total: 3, totalPages: 2 } }))
      .mockReturnValueOnce(of({ items: [p('c', 2026, 8)], pagination: { page: 2, limit: 100, total: 3, totalPages: 2 } }));

    store.start('e-me');

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list.mock.calls[0][0]).toEqual(expect.objectContaining({ page: 1, limit: 100, employeeId: 'e-me' }));
    expect(api.list.mock.calls[1][0]).toEqual(expect.objectContaining({ page: 2, limit: 100, employeeId: 'e-me' }));
    expect(store.payslips().map((s) => s.id)).toEqual(['c', 'b', 'a']);
    expect(store.loaded()).toBe(true);
  });

  it('offers the years that have payslips, shows the newest by default, and filters to the chosen one', () => {
    api.list.mockReturnValue(
      of(pageOf([payslip({ id: 'a', periodYear: 2025, periodMonth: 12 }), payslip({ id: 'b', periodYear: 2026, periodMonth: 8 })], 1, 100)),
    );
    store.start();

    expect(store.years()).toEqual([2026, 2025]);
    expect(store.selectedYear()).toBe(2026);
    expect(store.visiblePayslips().map((s) => s.id)).toEqual(['b']);

    store.selectYear(2025);
    expect(store.visiblePayslips().map((s) => s.id)).toEqual(['a']);
  });

  it('has no selected year when there are no payslips, and "loaded" tells empty from not-yet-loaded', () => {
    api.list.mockReturnValue(of(pageOf([], 1, 100)));
    expect(store.loaded()).toBe(false);

    store.start();

    expect(store.loaded()).toBe(true);
    expect(store.selectedYear()).toBeNull();
    expect(store.visiblePayslips()).toEqual([]);
  });

  it('shows the backend message on failure', () => {
    api.list.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500, error: { status: 'error', message: 'Database down' } })));

    store.start();

    expect(store.error()).toBe('Database down');
    expect(store.loading()).toBe(false);
  });
});
