import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { Shift } from '../data-access/shift.models';
import { ShiftService } from '../data-access/shift.service';
import { ShiftStore } from '../data-access/shift.store';
import { ShiftFormDialogComponent } from '../shift-form/shift-form-dialog.component';
import { ShiftListPageComponent } from './shift-list-page.component';

const shift = (overrides: Partial<Shift> = {}): Shift => ({
  id: 'sh-1',
  name: 'Day Shift',
  startTime: '09:00',
  endTime: '18:00',
  workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  status: 'ACTIVE',
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
  ...overrides,
});

const page = (items: Shift[]) => ({ items, pagination: { page: 1, limit: 10, total: items.length, totalPages: 1 } });

describe('ShiftListPageComponent', () => {
  const api = { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const dialog = { open: vi.fn() };

  const setup = (permissions: string[]): { fixture: ComponentFixture<ShiftListPageComponent>; el: HTMLElement; store: ShiftStore } => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SessionStore,
          useValue: { hasAnyPermission: (...keys: string[]) => keys.some((key) => permissions.includes(key)) },
        },
        { provide: NotificationService, useValue: { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() } },
        { provide: ShiftService, useValue: api },
        { provide: MatDialog, useValue: dialog },
      ],
    });

    const fixture = TestBed.createComponent(ShiftListPageComponent);
    fixture.detectChanges();

    return { fixture, el: fixture.nativeElement as HTMLElement, store: TestBed.inject(ShiftStore) };
  };

  const confirmDialogReturns = (confirmed: boolean) => dialog.open.mockReturnValue({ afterClosed: () => of(confirmed) });

  beforeEach(() => {
    api.list.mockReset();
    api.delete.mockReset();
    dialog.open.mockReset();
    api.list.mockReturnValue(of(page([shift(), shift({ id: 'sh-2', name: 'Night Shift', startTime: '22:00', endTime: '06:00' })])));
  });

  it('loads the list on init and titles the page', () => {
    const { el } = setup([]);

    expect(api.list).toHaveBeenCalledTimes(1);
    expect(el.querySelector('h1')?.textContent).toContain('Shifts');
    expect(el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(2);
  });

  describe('permission gating', () => {
    it('hides New, Edit and Delete without shift:create/update/delete (every role has shift:read)', () => {
      const { el } = setup(['shift:read']);

      expect(el.textContent).not.toContain('New Shift');
      expect(el.querySelectorAll('button[aria-label^="Edit "]')).toHaveLength(0);
      expect(el.querySelectorAll('button[aria-label^="Delete "]')).toHaveLength(0);
    });

    it('shows New, Edit and Delete with the matching permissions', () => {
      const { el } = setup(['shift:create', 'shift:update', 'shift:delete']);

      expect(el.textContent).toContain('New Shift');
      expect(el.querySelectorAll('button[aria-label^="Edit "]')).toHaveLength(2);
      expect(el.querySelectorAll('button[aria-label^="Delete "]')).toHaveLength(2);
    });

    it("does not honour another domain's permission keys", () => {
      const { el } = setup(['designation:create', 'designation:update', 'designation:delete']);

      expect(el.textContent).not.toContain('New Shift');
      expect(el.querySelectorAll('button[aria-label^="Edit "]')).toHaveLength(0);
    });
  });

  describe('empty and error states', () => {
    it('says "No shifts yet" when nothing exists', () => {
      api.list.mockReturnValue(of(page([])));

      const { el } = setup([]);

      expect(el.querySelector('app-empty-state')?.textContent).toContain('No shifts yet');
    });

    it('says the filter matched nothing once a filter is active', () => {
      api.list.mockReturnValue(of(page([])));
      const { fixture, el, store } = setup([]);

      store.setFilters({ search: 'zzz' });
      fixture.detectChanges();

      expect(el.querySelector('app-empty-state')?.textContent).toContain('No shifts match your filters');
    });

    it("shows the store's load error in a banner", () => {
      api.list.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500, error: { status: 'error', message: 'boom' } })),
      );

      const { el } = setup([]);

      expect(el.querySelector('app-inline-banner')?.textContent).toContain('boom');
    });
  });

  describe('dialogs', () => {
    it('New opens the Shift form dialog in create mode', () => {
      const { el } = setup(['shift:create']);

      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('New Shift'))!.click();

      expect(dialog.open).toHaveBeenCalledWith(ShiftFormDialogComponent, expect.objectContaining({ data: { shift: null } }));
    });

    it('Edit opens the dialog with that shift', () => {
      const { el } = setup(['shift:update']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Edit Night Shift"]')!.click();

      expect(dialog.open).toHaveBeenCalledWith(
        ShiftFormDialogComponent,
        expect.objectContaining({ data: { shift: expect.objectContaining({ id: 'sh-2' }) } }),
      );
    });
  });

  describe('sorting', () => {
    it('sorts by a Shift-only column (startTime) and ignores the cleared third-click state', () => {
      const { fixture } = setup([]);
      const page$ = fixture.componentInstance as unknown as { onSortChange: (s: { active: string; direction: string }) => void };

      page$.onSortChange({ active: 'startTime', direction: 'asc' });
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'startTime', order: 'asc' }));

      const calls = api.list.mock.calls.length;
      page$.onSortChange({ active: 'startTime', direction: '' });
      expect(api.list.mock.calls.length).toBe(calls);
    });
  });

  describe('delete flow', () => {
    it('asks for confirmation with copy that points at deactivation, and deletes only when confirmed', () => {
      confirmDialogReturns(true);
      api.delete.mockReturnValue(of(undefined));
      const { el } = setup(['shift:delete']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Delete Day Shift"]')!.click();

      const [component, config] = dialog.open.mock.calls[0];
      expect(component).toBe(ConfirmDialogComponent);
      expect(config.data.title).toBe('Delete shift');
      expect(config.data.message).toContain('"Day Shift"');
      expect(config.data.message).toContain('deactivate it instead');
      expect(api.delete).toHaveBeenCalledWith('sh-1');
    });

    it('does nothing when the confirmation is cancelled', () => {
      confirmDialogReturns(false);
      const { el } = setup(['shift:delete']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Delete Day Shift"]')!.click();

      expect(api.delete).not.toHaveBeenCalled();
    });

    it("shows the backend's message when the delete is rejected (409: employees reference it)", () => {
      confirmDialogReturns(true);
      api.delete.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { status: 'error', message: 'has Employee records referencing it - deactivate it instead' },
            }),
        ),
      );
      const { fixture, el } = setup(['shift:delete']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Delete Day Shift"]')!.click();
      fixture.detectChanges();

      expect(el.querySelector('app-inline-banner')?.textContent).toContain('deactivate it instead');
      expect(el.querySelector('button[aria-label="Delete Day Shift"]')).not.toBeNull();
    });
  });
});
