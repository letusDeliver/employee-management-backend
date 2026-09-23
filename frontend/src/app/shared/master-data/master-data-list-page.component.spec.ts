import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of, throwError } from 'rxjs';

import { SessionStore } from '../../core/auth/session.store';
import { NotificationService } from '../../core/notifications/notification.service';
import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { MasterDataFormDialogComponent } from './master-data-form-dialog.component';
import { MasterDataListPageComponent } from './master-data-list-page.component';
import { MasterDataApi, MasterDataLabels, MasterDataPage, MasterDataRecord } from './master-data.models';
import { MasterDataStore } from './master-data.store';

const record = (overrides: Partial<MasterDataRecord> = {}): MasterDataRecord => ({
  id: 'r-1',
  name: 'Engineering',
  code: 'ENG',
  status: 'ACTIVE',
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z',
  ...overrides,
});

const page = (items: MasterDataRecord[]): MasterDataPage<MasterDataRecord> => ({
  items,
  pagination: { page: 1, limit: 10, total: items.length, totalPages: 1 },
});

describe('MasterDataListPageComponent', () => {
  const api = {
    list: vi.fn<() => Observable<MasterDataPage<MasterDataRecord>>>(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const dialog = { open: vi.fn() };

  class TestStore extends MasterDataStore<MasterDataRecord> {
    protected readonly api: MasterDataApi<MasterDataRecord> = api;
    readonly labels: MasterDataLabels = { singular: 'Widget', plural: 'Widgets' };
  }

  let store: TestStore;

  const setup = (
    permissions: string[],
    options: { description?: string } = {},
  ): { fixture: ComponentFixture<MasterDataListPageComponent>; el: HTMLElement } => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SessionStore,
          useValue: { hasAnyPermission: (...keys: string[]) => keys.some((key) => permissions.includes(key)) },
        },
        { provide: NotificationService, useValue: { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() } },
        { provide: MatDialog, useValue: dialog },
      ],
    });

    store = TestBed.runInInjectionContext(() => new TestStore());
    const fixture = TestBed.createComponent(MasterDataListPageComponent);
    fixture.componentRef.setInput('store', store);
    fixture.componentRef.setInput('icon', 'apartment');
    fixture.componentRef.setInput('permissionPrefix', 'widget');
    if (options.description) {
      fixture.componentRef.setInput('description', options.description);
    }
    fixture.detectChanges();

    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const confirmDialogReturns = (confirmed: boolean) =>
    dialog.open.mockReturnValue({ afterClosed: () => of(confirmed) });

  beforeEach(() => {
    api.list.mockReset();
    api.delete.mockReset();
    dialog.open.mockReset();
    api.list.mockReturnValue(of(page([record(), record({ id: 'r-2', name: 'Finance', code: null })])));
  });

  it('loads the list on init and titles the page from the store labels', () => {
    const { el } = setup([]);

    expect(api.list).toHaveBeenCalledTimes(1);
    expect(el.querySelector('h1')?.textContent).toContain('Widgets');
    expect(el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(2);
  });

  it('shows the optional description under the title', () => {
    const { el } = setup([], { description: 'Things that widgets do' });

    expect(el.textContent).toContain('Things that widgets do');
  });

  describe('permission gating (the prefix comes from the caller)', () => {
    it('hides New, Edit and Delete without widget:create/update/delete', () => {
      const { el } = setup(['widget:read']);

      expect(el.textContent).not.toContain('New Widget');
      expect(el.querySelectorAll('button[aria-label^="Edit "]')).toHaveLength(0);
      expect(el.querySelectorAll('button[aria-label^="Delete "]')).toHaveLength(0);
    });

    it('shows New, Edit and Delete with the matching permissions', () => {
      const { el } = setup(['widget:create', 'widget:update', 'widget:delete']);

      expect(el.textContent).toContain('New Widget');
      expect(el.querySelectorAll('button[aria-label^="Edit "]')).toHaveLength(2);
      expect(el.querySelectorAll('button[aria-label^="Delete "]')).toHaveLength(2);
    });

    it('does not honour another domain\'s permission keys', () => {
      const { el } = setup(['department:create', 'department:update', 'department:delete']);

      expect(el.textContent).not.toContain('New Widget');
      expect(el.querySelectorAll('button[aria-label^="Edit "]')).toHaveLength(0);
    });
  });

  describe('empty and error states', () => {
    it('says "No widgets yet" when nothing exists', () => {
      api.list.mockReturnValue(of(page([])));

      const { el } = setup([]);

      expect(el.querySelector('app-empty-state')?.textContent).toContain('No widgets yet');
      expect(el.querySelector('app-empty-state')?.textContent).toContain('Widget records will appear here once you add one.');
    });

    it('says the filter matched nothing once a filter is active', () => {
      api.list.mockReturnValue(of(page([])));
      const { fixture, el } = setup([]);

      store.setFilters({ search: 'zzz' });
      fixture.detectChanges();

      expect(el.querySelector('app-empty-state')?.textContent).toContain('No widgets match your filters');
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
    it('New opens the form dialog in create mode with the store', () => {
      const { el } = setup(['widget:create']);

      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('New Widget'))!.click();

      expect(dialog.open).toHaveBeenCalledWith(
        MasterDataFormDialogComponent,
        expect.objectContaining({ data: { record: null, store } }),
      );
    });

    it('Edit opens the form dialog with that record', () => {
      const { el } = setup(['widget:update']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Edit Finance"]')!.click();

      expect(dialog.open).toHaveBeenCalledWith(
        MasterDataFormDialogComponent,
        expect.objectContaining({ data: expect.objectContaining({ record: expect.objectContaining({ id: 'r-2' }) }) }),
      );
    });
  });

  describe('delete flow', () => {
    it('asks for confirmation with copy that points at deactivation, and deletes only when confirmed', () => {
      confirmDialogReturns(true);
      api.delete.mockReturnValue(of(undefined));
      const { el } = setup(['widget:delete']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Delete Engineering"]')!.click();

      const [component, config] = dialog.open.mock.calls[0];
      expect(component).toBe(ConfirmDialogComponent);
      expect(config.data.title).toBe('Delete widget');
      expect(config.data.message).toContain('"Engineering"');
      expect(config.data.message).toContain('deactivate it instead');
      expect(api.delete).toHaveBeenCalledWith('r-1');
    });

    it('does nothing when the confirmation is cancelled', () => {
      confirmDialogReturns(false);
      const { el } = setup(['widget:delete']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Delete Engineering"]')!.click();

      expect(api.delete).not.toHaveBeenCalled();
    });

    it("shows the backend's message when the delete is rejected (e.g. 409 in use)", () => {
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
      const { fixture, el } = setup(['widget:delete']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Delete Engineering"]')!.click();
      fixture.detectChanges();

      expect(el.querySelector('app-inline-banner')?.textContent).toContain('deactivate it instead');
      expect(el.querySelector('button[aria-label="Delete Engineering"]')).not.toBeNull();
    });
  });
});
