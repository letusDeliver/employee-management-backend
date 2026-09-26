import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AttendanceFormDialogComponent } from '../attendance-form/attendance-form-dialog.component';
import { StatusLookupDialogComponent } from '../status-lookup/status-lookup-dialog.component';
import { AttendanceRecord } from '../data-access/attendance.models';
import { AttendanceService } from '../data-access/attendance.service';
import { AttendanceListPageComponent } from './attendance-list-page.component';

const record = (id: string, overrides: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  id,
  employeeId: 'e-1',
  date: '2026-09-15T00:00:00.000Z',
  checkIn: new Date(2026, 8, 15, 9, 5).toISOString(),
  checkOut: new Date(2026, 8, 15, 18, 2).toISOString(),
  isHalfDay: false,
  createdAt: '2026-09-15T09:05:00.000Z',
  updatedAt: '2026-09-15T18:02:00.000Z',
  ...overrides,
});

const page = (records: AttendanceRecord[]) => ({
  records,
  pagination: { page: 1, limit: 10, total: records.length, totalPages: 1 },
});

const httpError = (status: number, message: string) =>
  throwError(() => new HttpErrorResponse({ status, error: { status: 'error', message } }));

describe('AttendanceListPageComponent', () => {
  const api = { list: vi.fn(), delete: vi.fn(), create: vi.fn(), update: vi.fn() };
  const dialog = { open: vi.fn() };
  const directory = {
    options: signal([{ id: 'e-1', label: 'Amit Rao', detail: 'Joined Jan 5, 2024' }]),
    entries: signal([]),
    loading: signal(false),
    error: signal<string | null>(null),
    labelOf: () => 'Amit Rao',
    personNameOf: () => 'Amit Rao',
    detailOf: () => 'Joined Jan 5, 2024',
    refresh: vi.fn(() => of([])),
  };

  const setup = (permissions: string[]): { fixture: ComponentFixture<AttendanceListPageComponent>; el: HTMLElement } => {
    TestBed.configureTestingModule({
      providers: [
        provideNativeDateAdapter(),
        { provide: SessionStore, useValue: { hasAnyPermission: (...keys: string[]) => keys.some((k) => permissions.includes(k)) } },
        { provide: NotificationService, useValue: { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() } },
        { provide: AttendanceService, useValue: api },
        { provide: EmployeeDirectoryService, useValue: directory },
        { provide: MatDialog, useValue: dialog },
      ],
    });

    const fixture = TestBed.createComponent(AttendanceListPageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const button = (el: HTMLElement, text: RegExp) =>
    [...el.querySelectorAll('button')].find((b) => text.test(b.textContent ?? '') || text.test(b.getAttribute('aria-label') ?? ''));
  const rows = (el: HTMLElement) => el.querySelectorAll('tr.mat-mdc-row');

  beforeEach(() => {
    api.list.mockReset();
    api.delete.mockReset();
    dialog.open.mockReset();
    directory.refresh.mockClear();
    directory.error.set(null);
    api.list.mockReturnValue(of(page([record('a'), record('b')])));
  });

  it('loads the ledger, newest first, and the employee directory on entry', () => {
    setup([]);

    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.list.mock.calls[0][0]).toMatchObject({ page: 1, limit: 10, sortBy: 'date', order: 'desc' });
    expect(directory.refresh).toHaveBeenCalledTimes(1);
  });

  it('shows the records', () => {
    const { el } = setup([]);

    expect(rows(el)).toHaveLength(2);
    expect(el.querySelector('h1')?.textContent).toContain('Attendance records');
  });

  describe('permissions', () => {
    it('offers Check Status to whoever can read, but New Record only with attendance:create:any', () => {
      const read = setup(['attendance:read:any']);
      expect(button(read.el, /Check Status/)).toBeDefined();
      expect(button(read.el, /New Record/)).toBeUndefined();

      TestBed.resetTestingModule();

      const create = setup(['attendance:read:any', 'attendance:create:any']);
      expect(button(create.el, /New Record/)).toBeDefined();
    });

    it('gates Edit on attendance:update:any and Delete on attendance:delete:any independently', () => {
      const { el } = setup(['attendance:update:any']);

      expect(button(el, /^Edit /)).toBeDefined();
      expect(button(el, /^Delete /)).toBeUndefined();
    });
  });

  describe('empty and error states', () => {
    it('explains an empty ledger differently from a filter that matched nothing', () => {
      api.list.mockReturnValue(of(page([])));
      const { fixture, el } = setup([]);
      expect(el.textContent).toContain('No attendance records yet');

      const toolbar = fixture.debugElement.query((d) => d.name === 'app-attendance-toolbar').componentInstance;
      toolbar.filtersChange.emit({ employeeId: 'e-1' });
      fixture.detectChanges();

      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ employeeId: 'e-1', page: 1 }));
      expect(el.textContent).toContain('No records match your filters');
    });

    it('shows a load error with a Retry that asks again', () => {
      api.list.mockReturnValueOnce(httpError(500, 'boom')).mockReturnValue(of(page([record('a')])));
      const { fixture, el } = setup([]);

      expect(el.textContent).toContain('boom');

      button(el, /Retry/)!.click();
      fixture.detectChanges();

      expect(api.list).toHaveBeenCalledTimes(2);
      expect(rows(el)).toHaveLength(1);
    });

    it('warns, without hiding the table, when the employee names could not be loaded - and can retry', () => {
      directory.error.set('down');
      const { fixture, el } = setup([]);

      expect(el.textContent).toContain('Employee names could not be loaded');
      expect(rows(el)).toHaveLength(2);

      directory.refresh.mockClear();
      button(el, /Retry/)!.click();
      fixture.detectChanges();
      expect(directory.refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('dialogs', () => {
    it('opens the create dialog with no record and the page\'s own store', () => {
      const { el } = setup(['attendance:create:any']);

      button(el, /New Record/)!.click();

      const [component, config] = dialog.open.mock.calls[0];
      expect(component).toBe(AttendanceFormDialogComponent);
      expect(config.data.record).toBeNull();
      expect(config.data.store).toBeDefined();
    });

    it('opens the correct dialog with that record', () => {
      const { el } = setup(['attendance:update:any']);

      button(el, /^Edit /)!.click();

      const [component, config] = dialog.open.mock.calls[0];
      expect(component).toBe(AttendanceFormDialogComponent);
      expect(config.data.record.id).toBe('a');
    });

    it('opens the status lookup', () => {
      const { el } = setup([]);

      button(el, /Check Status/)!.click();

      expect(dialog.open.mock.calls[0][0]).toBe(StatusLookupDialogComponent);
    });
  });

  describe('delete', () => {
    it('confirms first, naming the employee and the day, and does nothing when declined', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });
      const { el } = setup(['attendance:delete:any']);

      button(el, /^Delete /)!.click();

      const [component, config] = dialog.open.mock.calls[0];
      expect(component).toBe(ConfirmDialogComponent);
      expect(config.data.message).toContain("Amit Rao's record for");
      expect(config.data.message).toMatch(/15.*2026/);
      expect(api.delete).not.toHaveBeenCalled();
    });

    it('deletes after confirmation and refetches the list', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) });
      api.delete.mockReturnValue(of(undefined));
      const { el } = setup(['attendance:delete:any']);
      api.list.mockClear();

      button(el, /^Delete /)!.click();

      expect(api.delete).toHaveBeenCalledWith('a');
      expect(api.list).toHaveBeenCalledTimes(1);
    });

    it("keeps the backend's message and the list when the delete is refused", () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) });
      api.delete.mockReturnValue(httpError(404, 'Attendance record not found'));
      const { fixture, el } = setup(['attendance:delete:any']);

      button(el, /^Delete /)!.click();
      fixture.detectChanges();

      expect(el.textContent).toContain('Attendance record not found');
      expect(rows(el)).toHaveLength(2);
    });
  });
});
