import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LeaveType } from '../data-access/leave.models';
import { LeaveTypeService } from '../data-access/leave-type.service';
import { LeaveTypeFormDialogComponent } from '../leave-type-form/leave-type-form-dialog.component';
import { LeaveTypeListPageComponent } from './leave-type-list-page.component';

const type = (id: string, name: string): LeaveType => ({
  id,
  name,
  defaultAnnualEntitlement: 18,
  isPaid: true,
  status: 'ACTIVE',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

const page = (items: LeaveType[]) => ({ items, pagination: { page: 1, limit: 10, total: items.length, totalPages: 1 } });

describe('LeaveTypeListPageComponent', () => {
  const api = { list: vi.fn(), delete: vi.fn(), create: vi.fn(), update: vi.fn() };
  const dialog = { open: vi.fn() };

  const setup = (permissions: string[]): { fixture: ComponentFixture<LeaveTypeListPageComponent>; el: HTMLElement } => {
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionStore, useValue: { hasAnyPermission: (...keys: string[]) => keys.some((k) => permissions.includes(k)) } },
        { provide: NotificationService, useValue: { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() } },
        { provide: LeaveTypeService, useValue: api },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(LeaveTypeListPageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const button = (el: HTMLElement, text: RegExp) =>
    [...el.querySelectorAll('button')].find((b) => text.test(b.textContent ?? '') || text.test(b.getAttribute('aria-label') ?? ''));

  beforeEach(() => {
    api.list.mockReset();
    api.delete.mockReset();
    dialog.open.mockReset();
    api.list.mockReturnValue(of(page([type('a', 'Annual Leave'), type('b', 'Sick Leave')])));
  });

  it('loads the list on entry and shows the rows', () => {
    const { el } = setup([]);

    expect(api.list).toHaveBeenCalledTimes(1);
    expect(el.querySelector('h1')?.textContent).toContain('Leave types');
    expect(el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(2);
  });

  it('gives a non-admin the list and NO create/edit/delete', () => {
    const { el } = setup([]);

    expect(button(el, /New Leave Type/)).toBeUndefined();
    expect(button(el, /^Edit /)).toBeUndefined();
    expect(button(el, /^Delete /)).toBeUndefined();
  });

  it('gates New, Edit and Delete on their own permission keys', () => {
    const create = setup(['leaveType:create']);
    expect(button(create.el, /New Leave Type/)).toBeDefined();
    expect(button(create.el, /^Edit /)).toBeUndefined();

    TestBed.resetTestingModule();
    const update = setup(['leaveType:update']);
    expect(button(update.el, /^Edit /)).toBeDefined();
    expect(button(update.el, /^Delete /)).toBeUndefined();
  });

  it('explains an empty list differently for someone who can add a type and someone who cannot', () => {
    api.list.mockReturnValue(of(page([])));

    const reader = setup([]);
    expect(reader.el.textContent).toContain('once an administrator adds one');

    TestBed.resetTestingModule();
    const admin = setup(['leaveType:create']);
    expect(admin.el.textContent).toContain('Add the first leave type');
  });

  it('shows a load error with a Retry that asks again', () => {
    api.list.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'boom' } }))).mockReturnValue(of(page([type('a', 'Annual Leave')])));
    const { fixture, el } = setup([]);

    expect(el.textContent).toContain('boom');
    button(el, /Retry/)!.click();
    fixture.detectChanges();

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);
  });

  it('opens the create and edit dialogs with the right data', () => {
    const { el } = setup(['leaveType:create', 'leaveType:update']);

    button(el, /New Leave Type/)!.click();
    button(el, /^Edit /)!.click();

    expect(dialog.open.mock.calls[0][0]).toBe(LeaveTypeFormDialogComponent);
    expect(dialog.open.mock.calls[0][1].data.leaveType).toBeNull();
    expect(dialog.open.mock.calls[1][1].data.leaveType.id).toBe('a');
  });

  it('confirms a delete first and points at deactivating; nothing is deleted when declined', () => {
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });
    const { el } = setup(['leaveType:delete']);

    button(el, /^Delete /)!.click();

    const [component, config] = dialog.open.mock.calls[0];
    expect(component).toBe(ConfirmDialogComponent);
    expect(config.data.message).toContain('Annual Leave');
    expect(config.data.message).toContain('deactivate it instead');
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("keeps the backend's own message when a referenced type cannot be deleted (a 409 is a normal outcome)", () => {
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    api.delete.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { status: 'error', message: 'has LeaveRequest or LeaveBalance records referencing it' } })),
    );
    const { fixture, el } = setup(['leaveType:delete']);

    button(el, /^Delete /)!.click();
    fixture.detectChanges();

    expect(el.textContent).toContain('has LeaveRequest or LeaveBalance records referencing it');
    expect(el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(2);
  });
});
