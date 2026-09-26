import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LeaveRequest } from '../data-access/leave.models';
import { LeaveRequestService } from '../data-access/leave-request.service';
import { LeaveRequestListPageComponent } from './leave-request-list-page.component';
import { RejectLeaveDialogComponent } from './reject-leave-dialog.component';

const request = (id: string, employeeId: string, overrides: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id,
  employeeId,
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

const page = (items: LeaveRequest[]) => ({ items, pagination: { page: 1, limit: 10, total: items.length, totalPages: 1 } });
const httpError = (status: number, message: string) => throwError(() => new HttpErrorResponse({ status, error: { status: 'error', message } }));

describe('LeaveRequestListPageComponent', () => {
  const api = { list: vi.fn(), approve: vi.fn(), reject: vi.fn(), cancel: vi.fn() };
  const dialog = { open: vi.fn() };
  const types = { refresh: vi.fn(() => of([])), nameOf: (id: string) => (id === 't-1' ? 'Annual Leave' : null), entries: signal([]) };
  // e-report is the manager's (e-boss's) direct report; e-other is someone else's.
  const managers: Record<string, string | null> = { 'e-report': 'e-boss', 'e-other': 'e-someone', 'e-none': null };
  const directory = {
    options: signal([]),
    loading: signal(false),
    loaded: signal(true),
    error: signal<string | null>(null),
    labelOf: (id: string) => `Person ${id}`,
    personNameOf: () => 'Person',
    detailOf: () => 'Joined Jan 5, 2024',
    managerIdOf: (id: string) => managers[id],
    ownEmployeeId: vi.fn(() => 'e-boss' as string | null),
    refresh: vi.fn(() => of([])),
  };

  const setup = (permissions: string[]): { fixture: ComponentFixture<LeaveRequestListPageComponent>; el: HTMLElement } => {
    TestBed.configureTestingModule({
      providers: [
        provideNativeDateAdapter(),
        {
          provide: SessionStore,
          useValue: { user: signal({ id: 'u-boss' }), hasAnyPermission: (...keys: string[]) => keys.some((k) => permissions.includes(k)) },
        },
        { provide: NotificationService, useValue: { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() } },
        { provide: LeaveRequestService, useValue: api },
        { provide: LeaveTypeDirectoryService, useValue: types },
        { provide: EmployeeDirectoryService, useValue: directory },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(LeaveRequestListPageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const buttons = (el: HTMLElement, label: RegExp) => [...el.querySelectorAll('button')].filter((b) => label.test(b.getAttribute('aria-label') ?? '') || label.test(b.textContent ?? ''));
  const rows = (el: HTMLElement) => el.querySelectorAll('tr.mat-mdc-row');

  const ADMIN = ['leaveRequest:read:any', 'leaveRequest:decide:any', 'leaveRequest:cancel:any'];
  const MANAGER = ['leaveRequest:read:any', 'leaveRequest:decide:reports'];

  beforeEach(() => {
    api.list.mockReset();
    api.approve.mockReset();
    api.reject.mockReset();
    api.cancel.mockReset();
    dialog.open.mockReset();
    directory.refresh.mockClear();
    directory.ownEmployeeId.mockReturnValue('e-boss');
    directory.error.set(null);
    directory.loaded.set(true);
    api.list.mockReturnValue(of(page([request('r-report', 'e-report'), request('r-other', 'e-other')])));
  });

  it('starts on what an approver came for - PENDING - and loads the employee and leave-type directories', () => {
    setup(ADMIN);

    expect(api.list.mock.calls[0][0]).toMatchObject({ status: 'PENDING', sortBy: 'startDate', order: 'desc', page: 1 });
    expect(directory.refresh).toHaveBeenCalledTimes(1);
    expect(types.refresh).toHaveBeenCalledTimes(1);
  });

  describe('WHO MAY DECIDE (worked out from the manager link - the crux)', () => {
    it('lets an ADMIN approve and reject EVERY pending request', () => {
      const { el } = setup(ADMIN);

      expect(buttons(el, /^Approve /)).toHaveLength(2);
      expect(buttons(el, /^Reject /)).toHaveLength(2);
      expect(el.textContent).not.toContain('Not your report');
    });

    it("lets a MANAGER decide only their own direct report's request, and says so on the other", () => {
      const { el } = setup(MANAGER);

      expect(buttons(el, /^Approve /)).toHaveLength(1);
      expect(buttons(el, /^Approve /)[0].getAttribute('aria-label')).toContain('Person e-report');
      expect(el.textContent).toContain('Not your report');
    });

    it('offers a MANAGER nothing to decide when they have no employee record of their own', () => {
      directory.ownEmployeeId.mockReturnValue(null);
      const { el } = setup(MANAGER);

      expect(buttons(el, /^Approve /)).toHaveLength(0);
    });

    it('offers NOTHING - and warns with a Retry - when the employee directory failed (managers cannot be known)', () => {
      directory.error.set('down');
      directory.loaded.set(false);
      directory.ownEmployeeId.mockReturnValue(null);
      const { fixture, el } = setup(MANAGER);

      expect(el.textContent).toContain('Employees could not be loaded');
      expect(buttons(el, /^Approve /)).toHaveLength(0);
      expect(el.textContent).not.toContain('Not your report'); // it does not know, so it does not claim
      expect(rows(el)).toHaveLength(2); // the table still works

      directory.refresh.mockClear();
      buttons(el, /Retry/)[0].click();
      fixture.detectChanges();
      expect(directory.refresh).toHaveBeenCalledTimes(1);
    });

    it('never offers a decision on a request that is not pending', () => {
      api.list.mockReturnValue(of(page([request('r-done', 'e-report', { status: 'APPROVED', durationDays: 3 })])));
      const { el } = setup(ADMIN);

      expect(buttons(el, /^Approve /)).toHaveLength(0);
    });

    it('offers Cancel only to a caller with leaveRequest:cancel:any (ADMIN)', () => {
      expect(buttons(setup(ADMIN).el, /^Cancel /).length).toBeGreaterThan(0);

      TestBed.resetTestingModule();
      expect(buttons(setup(MANAGER).el, /^Cancel /)).toHaveLength(0);
    });
  });

  describe('approve', () => {
    it('confirms first, in a constructive tone, without inventing a day count', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });
      const { el } = setup(ADMIN);

      buttons(el, /^Approve /)[0].click();

      const [component, config] = dialog.open.mock.calls[0];
      expect(component).toBe(ConfirmDialogComponent);
      expect(config.data).toMatchObject({ confirmLabel: 'Approve', tone: 'primary' });
      expect(config.data.message).toContain('Person e-report');
      expect(config.data.message).toContain('Annual Leave');
      expect(config.data.message).toContain('worked out now');
      expect(api.approve).not.toHaveBeenCalled();
    });

    it('approves after confirmation and refetches the list', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) });
      api.approve.mockReturnValue(of(request('r-report', 'e-report', { status: 'APPROVED', durationDays: 4 })));
      const { el } = setup(ADMIN);
      api.list.mockClear();

      buttons(el, /^Approve /)[0].click();

      expect(api.approve).toHaveBeenCalledWith('r-report');
      expect(api.list).toHaveBeenCalledTimes(1);
    });

    it("shows the server's refusal inline (insufficient balance is a 409) and keeps the list", () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) });
      api.approve.mockReturnValue(httpError(409, 'Insufficient leave balance: 5 day(s) requested, 2 remaining'));
      const { fixture, el } = setup(ADMIN);

      buttons(el, /^Approve /)[0].click();
      fixture.detectChanges();

      expect(el.textContent).toContain('Insufficient leave balance: 5 day(s) requested, 2 remaining');
      expect(rows(el)).toHaveLength(2);
    });

    it('a new action clears the previous refusal', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) });
      api.approve.mockReturnValueOnce(httpError(409, 'Insufficient leave balance')).mockReturnValue(of(request('r-report', 'e-report', { status: 'APPROVED', durationDays: 1 })));
      const { fixture, el } = setup(ADMIN);

      buttons(el, /^Approve /)[0].click();
      fixture.detectChanges();
      expect(el.textContent).toContain('Insufficient leave balance');

      buttons(el, /^Approve /)[1].click();
      fixture.detectChanges();
      expect(el.textContent).not.toContain('Insufficient leave balance');
    });
  });

  it('opens the reject dialog with that request and the page\'s own store', () => {
    const { el } = setup(ADMIN);

    buttons(el, /^Reject /)[0].click();

    const [component, config] = dialog.open.mock.calls[0];
    expect(component).toBe(RejectLeaveDialogComponent);
    expect(config.data.request.id).toBe('r-report');
    expect(config.data.summary).toContain('Person e-report');
    expect(config.data.store).toBeDefined();
  });

  it('cancels after confirmation, with wording that gives the days back only for an approved request', () => {
    api.list.mockReturnValue(of(page([request('r-approved', 'e-report', { status: 'APPROVED', durationDays: 4 })])));
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    api.cancel.mockReturnValue(of(request('r-approved', 'e-report', { status: 'CANCELLED' })));
    const { el } = setup(ADMIN);

    buttons(el, /^Cancel /)[0].click();

    expect(dialog.open.mock.calls[0][1].data).toMatchObject({ confirmLabel: 'Cancel request', cancelLabel: 'Keep request' });
    expect(dialog.open.mock.calls[0][1].data.message).toContain("given back to the employee's balance");
    expect(api.cancel).toHaveBeenCalledWith('r-approved');
  });

  describe('states', () => {
    it('explains an empty ledger differently from a filter that matched nothing', () => {
      api.list.mockReturnValue(of(page([])));
      const { el } = setup(ADMIN);

      // The page starts on PENDING, so an empty list here is "nothing waiting", not "no requests ever".
      expect(el.textContent).toContain('No requests match your filters');
      expect(el.textContent).toContain('Nothing is waiting here');
    });

    it('shows a load error with a Retry that asks again', () => {
      api.list.mockReturnValueOnce(httpError(500, 'boom')).mockReturnValue(of(page([request('r-report', 'e-report')])));
      const { fixture, el } = setup(ADMIN);

      expect(el.textContent).toContain('boom');
      buttons(el, /Retry/)[0].click();
      fixture.detectChanges();

      expect(rows(el)).toHaveLength(1);
    });
  });
});
