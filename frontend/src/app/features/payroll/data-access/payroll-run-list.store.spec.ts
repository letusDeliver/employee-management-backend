import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { serverToday } from '../../../shared/utils/server-day.util';
import { pageOf, run } from './payroll.testing';
import { PayrollRunListStore } from './payroll-run-list.store';
import { PayrollRunService } from './payroll-run.service';

describe('PayrollRunListStore', () => {
  const api = { list: vi.fn(), create: vi.fn(), delete: vi.fn() };
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };
  let store: PayrollRunListStore;

  beforeEach(() => {
    api.list.mockReset().mockReturnValue(of(pageOf([run()], 1, 12)));
    api.create.mockReset();
    api.delete.mockReset();
    notifications.showSuccess.mockReset();
    TestBed.configureTestingModule({
      providers: [
        PayrollRunListStore,
        { provide: PayrollRunService, useValue: api },
        { provide: NotificationService, useValue: notifications },
      ],
    });
    store = TestBed.inject(PayrollRunListStore);
  });

  it("always asks for ONE year (the server's) sorted by month, twelve to a page - the only order the backend gets right", () => {
    store.load();

    expect(api.list).toHaveBeenCalledWith({
      page: 1,
      limit: 12,
      periodYear: Number(serverToday().slice(0, 4)),
      sortBy: 'periodMonth',
      order: 'desc',
    });
    expect(store.runs()).toEqual([run()]);
  });

  it('changing the year or the status refetches from page 1 and keeps the other filter', () => {
    store.load();
    store.setPage(2, 12);
    store.setYear(2025);
    store.setStatus('PAID');

    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, periodYear: 2025, status: 'PAID', sortBy: 'periodMonth' }));
    store.setStatus(undefined);
    expect(api.list.mock.lastCall?.[0].status).toBeUndefined();
  });

  it('create reports success and returns the new run (the page navigates to it)', () => {
    api.create.mockReturnValue(of(run({ id: 'new' })));
    let created: unknown;

    store.create({ periodMonth: 8, periodYear: 2026 }).subscribe((value) => (created = value));

    expect(api.create).toHaveBeenCalledWith({ periodMonth: 8, periodYear: 2026 });
    expect(created).toEqual(run({ id: 'new' }));
    expect(notifications.showSuccess).toHaveBeenCalledWith('Payroll run created.');
  });

  it('delete refetches the list afterwards', () => {
    store.load();
    api.delete.mockReturnValue(of(undefined));

    store.delete('run-1').subscribe();

    expect(api.delete).toHaveBeenCalledWith('run-1');
    expect(api.list).toHaveBeenCalledTimes(2);
  });
});
