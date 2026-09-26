import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LeaveBalance, LeaveRequest } from '../data-access/leave.models';
import { LeaveBalanceService } from '../data-access/leave-balance.service';
import { LeaveRequestService } from '../data-access/leave-request.service';
import { ApplyLeaveDialogComponent } from './apply-leave-dialog.component';
import { MyLeavePageComponent } from './my-leave-page.component';

const request = (id: string, overrides: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id,
  employeeId: 'e-me',
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

const balance = (id: string, overrides: Partial<LeaveBalance> = {}): LeaveBalance => ({
  id,
  employeeId: 'e-me',
  leaveTypeId: 't-1',
  year: new Date().getUTCFullYear(),
  entitlement: 10,
  consumed: 4,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const page = (items: LeaveRequest[]) => ({ items, pagination: { page: 1, limit: 10, total: items.length, totalPages: 1 } });
const balances = (items: LeaveBalance[]) => ({ items, pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 } });
const httpError = (status: number, message: string) => throwError(() => new HttpErrorResponse({ status, error: { status: 'error', message } }));

describe('MyLeavePageComponent', () => {
  const requestApi = { list: vi.fn(), cancel: vi.fn(), create: vi.fn() };
  const balanceApi = { list: vi.fn() };
  const dialog = { open: vi.fn() };
  const types = { refresh: vi.fn(() => of([])), nameOf: (id: string) => (id === 't-1' ? 'Annual Leave' : null) };
  const employees = { refresh: vi.fn(), ownEmployeeId: vi.fn() };
  const user = signal<{ id: string } | null>({ id: 'u-1' });

  const setup = (permissions: string[]): { fixture: ComponentFixture<MyLeavePageComponent>; el: HTMLElement } => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SessionStore,
          useValue: { user, hasAnyPermission: (...keys: string[]) => keys.some((k) => permissions.includes(k)) },
        },
        { provide: NotificationService, useValue: { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() } },
        { provide: LeaveRequestService, useValue: requestApi },
        { provide: LeaveBalanceService, useValue: balanceApi },
        { provide: LeaveTypeDirectoryService, useValue: types },
        { provide: EmployeeDirectoryService, useValue: employees },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(MyLeavePageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const button = (el: HTMLElement, text: RegExp) =>
    [...el.querySelectorAll('button')].find((b) => text.test(b.textContent ?? '') || text.test(b.getAttribute('aria-label') ?? ''));

  beforeEach(() => {
    requestApi.list.mockReset();
    requestApi.cancel.mockReset();
    balanceApi.list.mockReset();
    dialog.open.mockReset();
    types.refresh.mockClear();
    employees.refresh.mockReset();
    employees.ownEmployeeId.mockReset();
    requestApi.list.mockReturnValue(of(page([request('a')])));
    balanceApi.list.mockReturnValue(of(balances([balance('b-1')])));
    employees.refresh.mockReturnValue(of([]));
  });

  describe('whose leave is shown', () => {
    it('sends NO employee id for a plain EMPLOYEE (the server scopes them) and never loads the employee directory', () => {
      setup(['leaveRequest:create:own']);

      expect(requestApi.list.mock.calls[0][0].employeeId).toBeUndefined();
      expect(balanceApi.list.mock.calls[0][0].employeeId).toBeUndefined();
      expect(employees.refresh).not.toHaveBeenCalled();
    });

    it("sends the caller's OWN employee id on both lists for ADMIN/MANAGER (who hold :read:any), or they would see everyone's leave", () => {
      employees.ownEmployeeId.mockReturnValue('e-me');
      setup(['leaveRequest:create:own', 'leaveRequest:read:any', 'leaveBalance:read:any']);

      expect(employees.ownEmployeeId).toHaveBeenCalledWith('u-1');
      expect(requestApi.list.mock.calls[0][0].employeeId).toBe('e-me');
      expect(balanceApi.list.mock.calls[0][0].employeeId).toBe('e-me');
    });

    it('shows the "not linked" state - and fetches nothing - for an ADMIN/MANAGER with no employee record', () => {
      employees.ownEmployeeId.mockReturnValue(null);
      const { el } = setup(['leaveRequest:create:own', 'leaveRequest:read:any']);

      expect(el.textContent).toContain("Your account isn't linked to an employee record");
      expect(requestApi.list).not.toHaveBeenCalled();
      expect(balanceApi.list).not.toHaveBeenCalled();
      expect(button(el, /Apply for Leave/)).toBeUndefined();
    });

    it('blocks with an error and a Retry when their own employee cannot be determined - never the organisation\'s leave', () => {
      employees.refresh.mockReturnValueOnce(throwError(() => new Error('down'))).mockReturnValue(of([]));
      employees.ownEmployeeId.mockReturnValue('e-me');
      const { fixture, el } = setup(['leaveRequest:create:own', 'leaveRequest:read:any']);

      expect(el.textContent).toContain("Couldn't work out which employee record is yours");
      expect(requestApi.list).not.toHaveBeenCalled();
      expect(button(el, /Apply for Leave/)).toBeUndefined();

      button(el, /Retry/)!.click();
      fixture.detectChanges();

      expect(requestApi.list).toHaveBeenCalledTimes(1);
      expect(requestApi.list.mock.calls[0][0].employeeId).toBe('e-me');
    });
  });

  describe('balances', () => {
    it('shows each balance as days left and used-of-entitlement, named by its leave type', () => {
      const { el } = setup(['leaveRequest:create:own']);

      const card = el.querySelector('.balance-card')!;
      expect(card.textContent).toContain('Annual Leave');
      expect(card.textContent).toContain('6 days left');
      expect(card.textContent).toContain('Used 4 of 10 days');
    });

    it('says what "none yet" means instead of showing zeros', () => {
      balanceApi.list.mockReturnValue(of(balances([])));
      const { el } = setup(['leaveRequest:create:own']);

      expect(el.textContent).toContain('A balance is created when your first leave for the year is approved.');
      expect(el.querySelector('.balance-card')).toBeNull();
    });

    it('asks again for the chosen year', () => {
      const { fixture } = setup(['leaveRequest:create:own']);
      const store = (fixture.componentInstance as unknown as { store: { setYear: (y: number) => void } }).store;

      store.setYear(2025);

      expect(balanceApi.list.mock.calls.at(-1)![0].year).toBe(2025);
    });

    it('shows a balances failure on its own, with a Retry, leaving the requests table alone', () => {
      balanceApi.list.mockReturnValueOnce(httpError(500, 'boom')).mockReturnValue(of(balances([])));
      const { fixture, el } = setup(['leaveRequest:create:own']);

      expect(el.textContent).toContain('boom');
      expect(el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);

      button(el, /Retry/)!.click();
      fixture.detectChanges();
      expect(balanceApi.list).toHaveBeenCalledTimes(2);
    });
  });

  describe('requests', () => {
    it('lists them and explains an empty list', () => {
      const first = setup(['leaveRequest:create:own']);
      expect(first.el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);

      TestBed.resetTestingModule();
      requestApi.list.mockReturnValue(of(page([])));
      const empty = setup(['leaveRequest:create:own']);
      expect(empty.el.textContent).toContain('No leave requests yet');
    });

    it('shows a load error with a Retry that asks again', () => {
      requestApi.list.mockReturnValueOnce(httpError(500, 'boom')).mockReturnValue(of(page([request('a')])));
      const { fixture, el } = setup(['leaveRequest:create:own']);

      expect(el.textContent).toContain('boom');
      button(el, /Retry/)!.click();
      fixture.detectChanges();

      expect(el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);
    });
  });

  it('opens the apply dialog with the page\'s own store', () => {
    const { el } = setup(['leaveRequest:create:own']);

    button(el, /Apply for Leave/)!.click();

    const [component, config] = dialog.open.mock.calls[0];
    expect(component).toBe(ApplyLeaveDialogComponent);
    expect(config.data.store).toBeDefined();
  });

  describe('cancel', () => {
    it('confirms first, with wording that fits (a PENDING request has no balance to give back)', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });
      const { el } = setup(['leaveRequest:create:own']);

      button(el, /^Cancel /)!.click();

      const [component, config] = dialog.open.mock.calls[0];
      expect(component).toBe(ConfirmDialogComponent);
      expect(config.data.confirmLabel).toBe('Cancel request');
      expect(config.data.cancelLabel).toBe('Keep request');
      expect(config.data.message).toContain('Annual Leave');
      expect(config.data.message).not.toContain('given back');
      expect(requestApi.cancel).not.toHaveBeenCalled();
    });

    it('says the days are given back when the request was APPROVED', () => {
      requestApi.list.mockReturnValue(of(page([request('a', { status: 'APPROVED', durationDays: 4 })])));
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });
      const { el } = setup(['leaveRequest:create:own']);

      button(el, /^Cancel /)!.click();

      expect(dialog.open.mock.calls[0][1].data.message).toContain('given back to your balance');
    });

    it('cancels after confirmation and refetches BOTH the requests and the balances', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) });
      requestApi.cancel.mockReturnValue(of(request('a', { status: 'CANCELLED' })));
      const { el } = setup(['leaveRequest:create:own']);
      requestApi.list.mockClear();
      balanceApi.list.mockClear();

      button(el, /^Cancel /)!.click();

      expect(requestApi.cancel).toHaveBeenCalledWith('a');
      expect(requestApi.list).toHaveBeenCalledTimes(1);
      expect(balanceApi.list).toHaveBeenCalledTimes(1);
    });

    it("keeps the server's refusal in view when the cancel is refused", () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) });
      requestApi.cancel.mockReturnValue(httpError(400, 'An approved leave that has already started cannot be cancelled retroactively'));
      const { fixture, el } = setup(['leaveRequest:create:own']);

      button(el, /^Cancel /)!.click();
      fixture.detectChanges();

      expect(el.textContent).toContain('cannot be cancelled retroactively');
    });
  });
});
