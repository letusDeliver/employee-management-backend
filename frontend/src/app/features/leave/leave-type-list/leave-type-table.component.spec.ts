import { TestBed } from '@angular/core/testing';

import { LeaveType } from '../data-access/leave.models';
import { LeaveTypeTableComponent } from './leave-type-table.component';

const type = (id: string, overrides: Partial<LeaveType> = {}): LeaveType => ({
  id,
  name: `Type ${id}`,
  defaultAnnualEntitlement: 18,
  isPaid: true,
  status: 'ACTIVE',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

describe('LeaveTypeTableComponent', () => {
  const setup = (rows: LeaveType[], inputs: Partial<{ canEdit: boolean; canDelete: boolean; deletingIds: ReadonlySet<string> }> = {}) => {
    const fixture = TestBed.createComponent(LeaveTypeTableComponent);
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

  it('shows the name, the days per year, paid/unpaid in WORDS, the status and the created date', () => {
    const { el } = setup([type('a', { name: 'Annual Leave', defaultAnnualEntitlement: 18 })]);

    const [name, days, pay, status, created] = cells(el);
    expect(name).toBe('Annual Leave');
    expect(days).toBe('18');
    expect(pay).toBe('Paid');
    expect(status).toBe('Active');
    expect(created).toMatch(/Oct 1, 2026/);
  });

  it('says Unpaid and Inactive for the exceptions', () => {
    const { el } = setup([type('a', { isPaid: false, status: 'INACTIVE' })]);

    const cell = cells(el);
    expect(cell[2]).toBe('Unpaid');
    expect(cell[3]).toBe('Inactive');
  });

  it('keeps the short headers on one line and pins the actions column (it stays reachable on a phone)', () => {
    const { el } = setup([type('a')], { canEdit: true, canDelete: true });

    for (const name of ['Days per year', 'Pay', 'Created']) {
      const th = [...el.querySelectorAll('th')].find((h) => h.textContent?.trim() === name);
      expect(th?.classList.contains('whitespace-nowrap'), name).toBe(true);
    }
    expect((el.querySelector('tr.mat-mdc-row td:last-child') as HTMLElement).classList.contains('mat-mdc-table-sticky')).toBe(true);
  });

  it('shows Edit and Delete only with their own permission', () => {
    const none = setup([type('a')]);
    expect(button(none.el, /^Edit /)).toBeUndefined();
    expect(button(none.el, /^Delete /)).toBeUndefined();

    TestBed.resetTestingModule();
    const edit = setup([type('a')], { canEdit: true });
    expect(button(edit.el, /^Edit /)).toBeDefined();
    expect(button(edit.el, /^Delete /)).toBeUndefined();

    TestBed.resetTestingModule();
    const del = setup([type('a')], { canDelete: true });
    expect(button(del.el, /^Edit /)).toBeUndefined();
    expect(button(del.el, /^Delete /)).toBeDefined();
  });

  it('replaces Delete with a spinner while that row is being deleted, and emits the row when pressed', () => {
    const busy = setup([type('a')], { canDelete: true, deletingIds: new Set(['a']) });
    expect(button(busy.el, /^Delete /)).toBeUndefined();
    expect(busy.el.querySelector('mat-progress-spinner')).not.toBeNull();

    TestBed.resetTestingModule();
    const { fixture, el } = setup([type('a')], { canEdit: true, canDelete: true });
    const edited: LeaveType[] = [];
    const deleted: LeaveType[] = [];
    fixture.componentInstance.editRequested.subscribe((r) => edited.push(r));
    fixture.componentInstance.deleteRequested.subscribe((r) => deleted.push(r));

    button(el, /^Edit /)!.click();
    button(el, /^Delete /)!.click();

    expect(edited.map((r) => r.id)).toEqual(['a']);
    expect(deleted.map((r) => r.id)).toEqual(['a']);
  });
});
