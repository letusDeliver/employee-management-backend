import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { AttendanceRecord } from '../data-access/attendance.models';
import { AttendanceTableComponent } from './attendance-table.component';

const local = (d: number, h: number, m: number): string => new Date(2026, 8, d, h, m).toISOString();

const record = (id: string, overrides: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  id,
  employeeId: 'e-1',
  date: '2026-09-15T00:00:00.000Z',
  checkIn: local(15, 9, 5),
  checkOut: local(15, 18, 2),
  isHalfDay: false,
  createdAt: '2026-09-15T09:05:00.000Z',
  updatedAt: '2026-09-15T09:05:00.000Z',
  ...overrides,
});

describe('AttendanceTableComponent', () => {
  // e-1 has a resolvable name (an ADMIN's view); e-2 has none (a MANAGER's view).
  const directory = {
    labelOf: (id: string) => (id === 'e-1' ? 'Amit Rao' : 'Engineer, Sales'),
    personNameOf: (id: string) => (id === 'e-1' ? 'Amit Rao' : null),
    detailOf: () => 'Joined Jan 5, 2024',
  };

  const setup = (
    rows: AttendanceRecord[],
    inputs: Partial<{ canEdit: boolean; canDelete: boolean; deletingIds: ReadonlySet<string> }> = {},
  ) => {
    TestBed.configureTestingModule({ providers: [{ provide: EmployeeDirectoryService, useValue: directory }] });

    const fixture: ComponentFixture<AttendanceTableComponent> = TestBed.createComponent(AttendanceTableComponent);
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
  const button = (el: HTMLElement, label: RegExp) =>
    [...el.querySelectorAll('button')].find((b) => label.test(b.getAttribute('aria-label') ?? ''));

  it('shows the employee, the date, both punches, the worked time and the half-day flag', () => {
    const { el } = setup([record('a')]);

    const [employee, date, checkIn, checkOut, worked, halfDay] = cells(el);
    expect(employee).toBe('Amit Rao');
    expect(date).toMatch(/Sep 15, 2026/);
    expect(checkIn).toMatch(/9:05/);
    expect(checkOut).toMatch(/6:02/);
    expect(worked).toBe('8h 57m');
    expect(halfDay).toBe('—');
  });

  it('shows dashes for a missing punch and for the worked time it makes impossible', () => {
    const { el } = setup([record('a', { checkOut: null })]);

    const [, , , checkOut, worked] = cells(el);
    expect(checkOut).toBe('—');
    expect(worked).toBe('—');
  });

  it('flags a half day in words', () => {
    const { el } = setup([record('a', { isHalfDay: true })]);

    expect(cells(el)[5]).toBe('Yes');
  });

  it('shows the date on a night shift check-out that falls on the next day', () => {
    const { el } = setup([record('a', { checkIn: local(15, 22, 0), checkOut: local(16, 6, 30) })]);

    expect(cells(el)[3]).toMatch(/16/);
    expect(cells(el)[3]).toMatch(/Sep/);
  });

  it('adds a joining-date line under an employee with no resolvable name, so a MANAGER can tell rows apart', () => {
    const { el } = setup([record('a', { employeeId: 'e-2' })]);

    expect(cells(el)[0]).toBe('Engineer, Sales Joined Jan 5, 2024');
  });

  it('adds no extra line for an employee whose name is known', () => {
    const { el } = setup([record('a', { employeeId: 'e-1' })]);

    expect(cells(el)[0]).toBe('Amit Rao');
  });

  it('keeps the short headers on one line', () => {
    const { el } = setup([record('a')]);

    const headers = [...el.querySelectorAll('th')];
    for (const name of ['Date', 'Check in', 'Check out', 'Worked', 'Half day']) {
      const th = headers.find((h) => h.textContent?.trim() === name);
      expect(th?.classList.contains('whitespace-nowrap'), name).toBe(true);
    }
  });

  it('pins the actions column to the right edge so Edit and Delete stay reachable on a phone', () => {
    const { el } = setup([record('a')], { canEdit: true, canDelete: true });

    const actionsCell = el.querySelector('tr.mat-mdc-row td:last-child') as HTMLElement;
    expect(actionsCell.classList.contains('mat-mdc-table-sticky')).toBe(true);
  });

  describe('row actions follow the two permissions independently', () => {
    it('shows neither without permission', () => {
      const { el } = setup([record('a')]);

      expect(button(el, /^Edit /)).toBeUndefined();
      expect(button(el, /^Delete /)).toBeUndefined();
    });

    it('shows Correct only with canEdit', () => {
      const { el } = setup([record('a')], { canEdit: true });

      expect(button(el, /^Edit /)).toBeDefined();
      expect(button(el, /^Delete /)).toBeUndefined();
    });

    it('shows Delete only with canDelete', () => {
      const { el } = setup([record('a')], { canDelete: true });

      expect(button(el, /^Edit /)).toBeUndefined();
      expect(button(el, /^Delete /)).toBeDefined();
    });

    it('names the row for assistive tech: employee and date', () => {
      const { el } = setup([record('a')], { canEdit: true });

      expect(button(el, /^Edit /)?.getAttribute('aria-label')).toMatch(/^Edit Amit Rao, .*15.*2026$/);
    });

    it('replaces Delete with a spinner while that row is being deleted', () => {
      const { el } = setup([record('a')], { canDelete: true, deletingIds: new Set(['a']) });

      expect(button(el, /^Delete /)).toBeUndefined();
      expect(el.querySelector('mat-progress-spinner')).not.toBeNull();
    });
  });

  it('emits the row when Edit or Delete is pressed', () => {
    const { fixture, el } = setup([record('a')], { canEdit: true, canDelete: true });
    const edited: AttendanceRecord[] = [];
    const deleted: AttendanceRecord[] = [];
    fixture.componentInstance.editRequested.subscribe((r) => edited.push(r));
    fixture.componentInstance.deleteRequested.subscribe((r) => deleted.push(r));

    button(el, /^Edit /)!.click();
    button(el, /^Delete /)!.click();

    expect(edited.map((r) => r.id)).toEqual(['a']);
    expect(deleted.map((r) => r.id)).toEqual(['a']);
  });
});
