import { TestBed } from '@angular/core/testing';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { LeaveBalance } from '../data-access/leave.models';
import { LeaveBalanceTableComponent } from './leave-balance-table.component';

const balance = (id: string, overrides: Partial<LeaveBalance> = {}): LeaveBalance => ({
  id,
  employeeId: 'e-1',
  leaveTypeId: 't-1',
  year: 2026,
  entitlement: 10,
  consumed: 4,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

describe('LeaveBalanceTableComponent', () => {
  const employees = { labelOf: () => 'Amit Rao', personNameOf: () => 'Amit Rao', detailOf: () => 'Joined Jan 5, 2024' };
  const types = { nameOf: (id: string) => (id === 't-1' ? 'Annual Leave' : null) };

  const setup = (rows: LeaveBalance[], canAdjust = false) => {
    TestBed.configureTestingModule({
      providers: [
        { provide: EmployeeDirectoryService, useValue: employees },
        { provide: LeaveTypeDirectoryService, useValue: types },
      ],
    });
    const fixture = TestBed.createComponent(LeaveBalanceTableComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('pagination', { page: 1, limit: 10, total: rows.length, totalPages: 1 });
    fixture.componentRef.setInput('canAdjust', canAdjust);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const cells = (el: HTMLElement, row = 0) =>
    [...el.querySelectorAll('tr.mat-mdc-row')[row].querySelectorAll('td')].map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim());

  it('shows the employee, the type, the year, the entitlement, the days used and the days remaining', () => {
    const { el } = setup([balance('a')]);

    expect(cells(el).slice(0, 6)).toEqual(['Amit Rao', 'Annual Leave', '2026', '10', '4', '6']);
  });

  it('shows fractional days from a hire-year proration, without floating-point noise', () => {
    const { el } = setup([balance('a', { entitlement: 9.07, consumed: 3.02 })]);

    expect(cells(el).slice(3, 6)).toEqual(['9.07', '3.02', '6.05']);
  });

  it('says so, in words and not colour alone, when an override leaves the balance overdrawn', () => {
    const { el } = setup([balance('a', { entitlement: 5, consumed: 6.5 })]);

    expect(cells(el)[5]).toBe('-1.5 (overdrawn)');
  });

  it('degrades an unknown leave type to words, never an id', () => {
    expect(cells(setup([balance('a', { leaveTypeId: 't-gone' })]).el)[1]).toBe('Unknown leave type');
  });

  it('offers Adjust only with leaveBalance:adjust:any, naming the row, and emits it', () => {
    const none = setup([balance('a')]);
    expect(none.el.querySelector('button[aria-label^="Adjust"]')).toBeNull();

    TestBed.resetTestingModule();
    const { fixture, el } = setup([balance('a')], true);
    const emitted: LeaveBalance[] = [];
    fixture.componentInstance.adjustRequested.subscribe((b) => emitted.push(b));

    const button = el.querySelector('button[aria-label^="Adjust"]') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Adjust Amit Rao, Annual Leave 2026');
    button.click();

    expect(emitted.map((b) => b.id)).toEqual(['a']);
  });

  it('keeps the short headers on one line and pins the actions column', () => {
    const { el } = setup([balance('a')]);

    for (const name of ['Year', 'Entitlement', 'Used', 'Remaining']) {
      expect([...el.querySelectorAll('th')].find((h) => h.textContent?.trim() === name)?.classList.contains('whitespace-nowrap'), name).toBe(true);
    }
    expect((el.querySelector('tr.mat-mdc-row td:last-child') as HTMLElement).classList.contains('mat-mdc-table-sticky')).toBe(true);
  });
});
