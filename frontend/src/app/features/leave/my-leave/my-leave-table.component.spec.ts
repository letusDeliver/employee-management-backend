import { TestBed } from '@angular/core/testing';

import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { LeaveRequest } from '../data-access/leave.models';
import { MyLeaveTableComponent } from './my-leave-table.component';

const request = (id: string, overrides: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id,
  employeeId: 'e-me',
  leaveTypeId: 't-1',
  startDate: '2999-01-05T00:00:00.000Z', // far in the future: an APPROVED one has not started
  endDate: '2999-01-09T00:00:00.000Z',
  reason: null,
  status: 'PENDING',
  durationDays: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

describe('MyLeaveTableComponent', () => {
  const names: Record<string, string> = { 't-1': 'Annual Leave' };
  const directory = { nameOf: (id: string) => names[id] ?? null };

  const setup = (rows: LeaveRequest[], cancelling: string[] = []) => {
    TestBed.configureTestingModule({ providers: [{ provide: LeaveTypeDirectoryService, useValue: directory }] });
    const fixture = TestBed.createComponent(MyLeaveTableComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('pagination', { page: 1, limit: 10, total: rows.length, totalPages: 1 });
    fixture.componentRef.setInput('cancellingIds', new Set(cancelling));
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const cells = (el: HTMLElement, row = 0) =>
    [...el.querySelectorAll('tr.mat-mdc-row')[row].querySelectorAll('td')].map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim());
  const cancelButton = (el: HTMLElement) => [...el.querySelectorAll('button')].find((b) => /^Cancel /.test(b.getAttribute('aria-label') ?? ''));

  it('shows the type, the dates, a dash for a duration that is not known yet, and the status in words', () => {
    const { el } = setup([request('a', { reason: 'Family trip' })]);

    const [type, dates, days, status] = cells(el);
    expect(type).toBe('Annual Leave Family trip');
    expect(dates).toMatch(/2999/);
    expect(days).toBe('—');
    expect(status).toContain('Pending');
  });

  it('shows the duration once approved, fractions included', () => {
    const { el } = setup([request('a', { status: 'APPROVED', durationDays: 4 }), request('b', { status: 'APPROVED', durationDays: 2.5 })]);

    expect(cells(el, 0)[2]).toBe('4');
    expect(cells(el, 1)[2]).toBe('2.5');
  });

  it('degrades an unknown leave type to words - never an id', () => {
    const { el } = setup([request('a', { leaveTypeId: 't-gone' })]);

    expect(cells(el)[0]).toContain('Unknown leave type');
    expect(cells(el)[0]).not.toContain('t-gone');
  });

  describe('Cancel follows the backend rule, against the SERVER day', () => {
    it('is offered on a PENDING request', () => {
      expect(cancelButton(setup([request('a')]).el)).toBeDefined();
    });

    it('is offered on an APPROVED request that has not started', () => {
      TestBed.resetTestingModule();
      expect(cancelButton(setup([request('a', { status: 'APPROVED', durationDays: 4 })]).el)).toBeDefined();
    });

    it('is NOT offered on an APPROVED request that has already started', () => {
      TestBed.resetTestingModule();
      const started = request('a', { status: 'APPROVED', durationDays: 4, startDate: '2000-01-03T00:00:00.000Z', endDate: '2000-01-07T00:00:00.000Z' });

      expect(cancelButton(setup([started]).el)).toBeUndefined();
    });

    it.for(['REJECTED', 'CANCELLED'] as const)('is NOT offered on a %s request', (status) => {
      expect(cancelButton(setup([request('a', { status })]).el)).toBeUndefined();
    });
  });

  it('names the row for assistive tech, and emits the row when Cancel is pressed', () => {
    const { fixture, el } = setup([request('a')]);
    const emitted: LeaveRequest[] = [];
    fixture.componentInstance.cancelRequested.subscribe((r) => emitted.push(r));

    expect(cancelButton(el)?.getAttribute('aria-label')).toMatch(/^Cancel Annual Leave, .*2999/);
    cancelButton(el)!.click();

    expect(emitted.map((r) => r.id)).toEqual(['a']);
  });

  it('replaces Cancel with a spinner while that request is being cancelled', () => {
    const { el } = setup([request('a')], ['a']);

    expect(cancelButton(el)).toBeUndefined();
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
