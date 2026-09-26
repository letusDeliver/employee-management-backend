import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LeaveType } from './leave.models';
import { LeaveTypeService } from './leave-type.service';
import { LeaveTypeStore } from './leave-type.store';

const type: LeaveType = {
  id: 't-1',
  name: 'Annual Leave',
  defaultAnnualEntitlement: 18,
  isPaid: true,
  status: 'ACTIVE',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('LeaveTypeService', () => {
  let service: LeaveTypeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(LeaveTypeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists from /leave-types and maps its own `leaveTypes` key into the neutral items', () => {
    let result: unknown;
    service.list({ page: 1, limit: 10, search: 'ann', status: 'ACTIVE', sortBy: 'name', order: 'asc' }).subscribe((value) => (result = value));

    const request = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/leave-types'));
    expect(request.request.params.get('search')).toBe('ann');
    expect(request.request.params.get('status')).toBe('ACTIVE');
    const pagination = { page: 1, limit: 10, total: 1, totalPages: 1 };
    request.flush({ leaveTypes: [type], pagination });

    expect(result).toEqual({ items: [type], pagination });
  });

  it('creates, updates and deletes against /leave-types', () => {
    service.create({ name: 'Sick', defaultAnnualEntitlement: 10, isPaid: true }).subscribe();
    const create = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/leave-types'));
    expect(create.request.body).toEqual({ name: 'Sick', defaultAnnualEntitlement: 10, isPaid: true });
    create.flush({ leaveType: type });

    service.update('t-1', { isPaid: false }).subscribe();
    const update = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/leave-types/t-1'));
    expect(update.request.body).toEqual({ isPaid: false });
    update.flush({ leaveType: type });

    let deleted = false;
    service.delete('t-1').subscribe(() => (deleted = true));
    http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/leave-types/t-1')).flush({ message: 'Leave type deleted successfully' });
    expect(deleted).toBe(true);
  });
});

describe('LeaveTypeStore', () => {
  it('is a MasterDataStore over the Leave type service with its own wording', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const store = TestBed.inject(LeaveTypeStore);

    expect(store.labels).toEqual({ singular: 'Leave type', plural: 'Leave types' });
    expect(store.items()).toEqual([]);
  });
});
