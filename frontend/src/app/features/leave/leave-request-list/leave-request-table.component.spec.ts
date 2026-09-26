import { TestBed } from '@angular/core/testing';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { LeaveRequest } from '../data-access/leave.models';
import { LeaveRequestTableComponent } from './leave-request-table.component';

const request = (id: string, overrides: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id,
  employeeId: 'e-1',
  leaveTypeId: 't-1',
  startDate: '2999-01-05T00:00:00.000Z',
  endDate: '2999-01-09T00:00:00.000Z',
  reason: null,
  status: 'PENDING',
  durationDays: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

describe('LeaveRequestTableComponent', () => {
  const employees = { labelOf: () => 'Amit Rao', personNameOf: () => 'Amit Rao', detailOf: () => 'Joined Jan 5, 2024' };
  const types = { nameOf: (id: string) => (id === 't-1' ? 'Annual Leave' : null) };

  const setup = (
    rows: LeaveRequest[],
    inputs: Partial<{ decidableIds: ReadonlySet<string>; showNotYourReport: boolean; canCancelAny: boolean; busyIds: ReadonlySet<string> }> = {},
  ) => {
    TestBed.configureTestingModule({
      providers: [
        { provide: EmployeeDirectoryService, useValue: employees },
        { provide: LeaveTypeDirectoryService, useValue: types },
      ],
    });
    const fixture = TestBed.createComponent(LeaveRequestTableComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('pagination', { page: 1, limit: 10, total: rows.length, totalPages: 1 });
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const cells = (el: HTMLElement, row = 0) =>
    [...el.querySelectorAll('tr.mat-mdc-row')[row].querySelectorAll('td')].map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim());
  const button = (el: HTMLElement, label: RegExp) => [...el.querySelectorAll('button')].find((b) => label.test(b.getAttribute('aria-label') ?? ''));

  it('shows the employee, the type, the dates and the status in words', () => {
    const { el } = setup([request('a')]);

    const [employee, type, dates, days, status] = cells(el);
    expect(employee).toBe('Amit Rao');
    expect(type).toBe('Annual Leave');
    expect(dates).toMatch(/2999/);
    expect(days).toBe('—');
    expect(status).toContain('Pending');
  });

  it('shows the worked-out duration once approved and the reason under the type', () => {
    const { el } = setup([request('a', { status: 'APPROVED', durationDays: 4, reason: 'Family trip' })]);

    expect(cells(el)[3]).toBe('4');
    expect(cells(el)[1]).toBe('Annual Leave Family trip');
  });

  it('degrades an unknown leave type to words, never an id', () => {
    expect(cells(setup([request('a', { leaveTypeId: 't-gone' })]).el)[1]).toBe('Unknown leave type');
  });

  describe('Approve and Reject', () => {
    it('are offered ONLY on the rows the page says the caller may decide', () => {
      const { el } = setup([request('yes'), request('no')], { decidableIds: new Set(['yes']) });

      const rows = [...el.querySelectorAll('tr.mat-mdc-row')];
      const inRow = (i: number, label: RegExp) => [...rows[i].querySelectorAll('button')].some((b) => label.test(b.getAttribute('aria-label') ?? ''));
      expect(inRow(0, /^Approve /)).toBe(true);
      expect(inRow(0, /^Reject /)).toBe(true);
      expect(inRow(1, /^Approve /)).toBe(false);
      expect(inRow(1, /^Reject /)).toBe(false);
    });

    it('name the row for assistive tech and emit it', () => {
      const { fixture, el } = setup([request('a')], { decidableIds: new Set(['a']) });
      const approved: LeaveRequest[] = [];
      const rejected: LeaveRequest[] = [];
      fixture.componentInstance.approveRequested.subscribe((r) => approved.push(r));
      fixture.componentInstance.rejectRequested.subscribe((r) => rejected.push(r));

      expect(button(el, /^Approve /)?.getAttribute('aria-label')).toMatch(/^Approve Amit Rao, .*2999/);
      button(el, /^Approve /)!.click();
      button(el, /^Reject /)!.click();

      expect(approved.map((r) => r.id)).toEqual(['a']);
      expect(rejected.map((r) => r.id)).toEqual(['a']);
    });
  });

  describe('"Not your report"', () => {
    it('is said on a pending row the caller cannot decide, when the page asks for it (a MANAGER)', () => {
      const { el } = setup([request('a')], { showNotYourReport: true });

      expect(el.textContent).toContain('Not your report');
    });

    it('is not said when the page does not ask (an ADMIN decides everything; a not-yet-loaded directory says nothing)', () => {
      expect(setup([request('a')]).el.textContent).not.toContain('Not your report');
    });

    it('is not said on a row that is not pending, or on one the caller CAN decide', () => {
      TestBed.resetTestingModule();
      const decided = setup([request('a', { status: 'APPROVED', durationDays: 3 })], { showNotYourReport: true });
      expect(decided.el.textContent).not.toContain('Not your report');

      TestBed.resetTestingModule();
      const mine = setup([request('a')], { showNotYourReport: true, decidableIds: new Set(['a']) });
      expect(mine.el.textContent).not.toContain('Not your report');
    });
  });

  describe('Cancel (ADMIN, leaveRequest:cancel:any), judged against the SERVER day', () => {
    it('is offered on a PENDING request and on an APPROVED one that has not started', () => {
      const { el } = setup([request('a'), request('b', { status: 'APPROVED', durationDays: 2 })], { canCancelAny: true });

      expect([...el.querySelectorAll('button')].filter((b) => /^Cancel /.test(b.getAttribute('aria-label') ?? ''))).toHaveLength(2);
    });

    it('is NOT offered without the permission', () => {
      expect(button(setup([request('a')]).el, /^Cancel /)).toBeUndefined();
    });

    it('is NOT offered on an APPROVED request that has already started, or a decided one', () => {
      const started = request('a', { status: 'APPROVED', durationDays: 2, startDate: '2000-01-03T00:00:00.000Z', endDate: '2000-01-04T00:00:00.000Z' });
      const rejected = request('b', { status: 'REJECTED' });

      expect(button(setup([started, rejected], { canCancelAny: true }).el, /^Cancel /)).toBeUndefined();
    });

    it('emits the row', () => {
      const { fixture, el } = setup([request('a')], { canCancelAny: true });
      const emitted: LeaveRequest[] = [];
      fixture.componentInstance.cancelRequested.subscribe((r) => emitted.push(r));

      button(el, /^Cancel /)!.click();

      expect(emitted.map((r) => r.id)).toEqual(['a']);
    });
  });

  it('replaces a row\'s buttons with a spinner while a decision or cancellation is in flight', () => {
    const { el } = setup([request('a')], { decidableIds: new Set(['a']), canCancelAny: true, busyIds: new Set(['a']) });

    expect(button(el, /^(Approve|Reject|Cancel) /)).toBeUndefined();
    expect(el.querySelector('mat-progress-spinner')).not.toBeNull();
  });

  it('keeps the short headers on one line and pins the actions column', () => {
    const { el } = setup([request('a')]);

    for (const name of ['Dates', 'Days']) {
      expect([...el.querySelectorAll('th')].find((h) => h.textContent?.trim() === name)?.classList.contains('whitespace-nowrap'), name).toBe(true);
    }
    expect((el.querySelector('tr.mat-mdc-row td:last-child') as HTMLElement).classList.contains('mat-mdc-table-sticky')).toBe(true);
  });
});
