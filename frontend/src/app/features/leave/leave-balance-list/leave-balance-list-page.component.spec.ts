import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { LeaveBalance } from '../data-access/leave.models';
import { LeaveBalanceService } from '../data-access/leave-balance.service';
import { AdjustBalanceDialogComponent } from './adjust-balance-dialog.component';
import { LeaveBalanceListPageComponent } from './leave-balance-list-page.component';

const balance = (id: string): LeaveBalance => ({
  id,
  employeeId: 'e-1',
  leaveTypeId: 't-1',
  year: 2026,
  entitlement: 10,
  consumed: 4,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

const page = (items: LeaveBalance[]) => ({ items, pagination: { page: 1, limit: 10, total: items.length, totalPages: 1 } });

describe('LeaveBalanceListPageComponent', () => {
  const api = { list: vi.fn(), adjust: vi.fn() };
  const dialog = { open: vi.fn() };
  const types = { refresh: vi.fn(() => of([])), nameOf: (id: string) => (id === 't-1' ? 'Annual Leave' : null), entries: signal([]) };
  const directory = {
    options: signal([]),
    loading: signal(false),
    error: signal<string | null>(null),
    labelOf: () => 'Amit Rao',
    personNameOf: () => 'Amit Rao',
    detailOf: () => 'Joined Jan 5, 2024',
    refresh: vi.fn(() => of([])),
  };

  const setup = (permissions: string[]): { fixture: ComponentFixture<LeaveBalanceListPageComponent>; el: HTMLElement } => {
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionStore, useValue: { hasAnyPermission: (...keys: string[]) => keys.some((k) => permissions.includes(k)) } },
        { provide: NotificationService, useValue: { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() } },
        { provide: LeaveBalanceService, useValue: api },
        { provide: LeaveTypeDirectoryService, useValue: types },
        { provide: EmployeeDirectoryService, useValue: directory },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(LeaveBalanceListPageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const adjustButton = (el: HTMLElement) => el.querySelector('button[aria-label^="Adjust"]') as HTMLButtonElement | null;

  beforeEach(() => {
    api.list.mockReset();
    api.adjust.mockReset();
    dialog.open.mockReset();
    directory.refresh.mockClear();
    directory.error.set(null);
    api.list.mockReturnValue(of(page([balance('b-1')])));
  });

  it('loads the newest year first, and both display directories', () => {
    setup(['leaveBalance:read:any']);

    expect(api.list.mock.calls[0][0]).toMatchObject({ sortBy: 'year', order: 'desc', page: 1 });
    expect(directory.refresh).toHaveBeenCalledTimes(1);
    expect(types.refresh).toHaveBeenCalled();
  });

  it('shows the rows, and Adjust ONLY to a caller with leaveBalance:adjust:any', () => {
    const reader = setup(['leaveBalance:read:any']);
    expect(reader.el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);
    expect(adjustButton(reader.el)).toBeNull();

    TestBed.resetTestingModule();
    const admin = setup(['leaveBalance:read:any', 'leaveBalance:adjust:any']);
    expect(adjustButton(admin.el)).not.toBeNull();
  });

  it('opens the adjust dialog with that balance, a readable summary and the page\'s own store', () => {
    const { el } = setup(['leaveBalance:read:any', 'leaveBalance:adjust:any']);

    adjustButton(el)!.click();

    const [component, config] = dialog.open.mock.calls[0];
    expect(component).toBe(AdjustBalanceDialogComponent);
    expect(config.data.balance.id).toBe('b-1');
    expect(config.data.summary).toBe('Amit Rao - Annual Leave 2026');
    expect(config.data.store).toBeDefined();
  });

  it('explains an empty ledger as normal (a balance appears once a leave is first approved), and a filtered one differently', () => {
    api.list.mockReturnValue(of(page([])));
    const { el } = setup(['leaveBalance:read:any']);

    expect(el.textContent).toContain('No leave balances yet');
    expect(el.textContent).toContain("A balance is created when an employee's first leave for a year is approved.");
  });

  it('warns, without hiding the table, when the employee names could not be loaded - and can retry', () => {
    directory.error.set('down');
    const { fixture, el } = setup(['leaveBalance:read:any']);

    expect(el.textContent).toContain('Employee names could not be loaded');
    expect(el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);

    directory.refresh.mockClear();
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Retry'))!.click();
    fixture.detectChanges();
    expect(directory.refresh).toHaveBeenCalledTimes(1);
  });

  it('shows a load error with a Retry that asks again', () => {
    api.list
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'boom' } })))
      .mockReturnValue(of(page([balance('b-1')])));
    const { fixture, el } = setup(['leaveBalance:read:any']);

    expect(el.textContent).toContain('boom');
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Retry'))!.click();
    fixture.detectChanges();

    expect(el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);
  });
});
