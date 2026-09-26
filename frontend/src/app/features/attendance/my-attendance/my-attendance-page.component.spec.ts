import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { AttendanceRecord, EffectiveStatus } from '../data-access/attendance.models';
import { AttendanceService } from '../data-access/attendance.service';
import { MyAttendancePageComponent } from './my-attendance-page.component';

const record = (overrides: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  id: 'a-1',
  employeeId: 'e-1',
  date: '2026-09-15T00:00:00.000Z',
  checkIn: new Date(2026, 8, 15, 9, 5).toISOString(),
  checkOut: null,
  isHalfDay: false,
  createdAt: '2026-09-15T09:05:00.000Z',
  updatedAt: '2026-09-15T09:05:00.000Z',
  ...overrides,
});

const status = (value: EffectiveStatus, rec: AttendanceRecord | null) => ({
  employeeId: 'e-1',
  date: '2026-09-15T00:00:00.000Z',
  status: value,
  record: rec,
});

const httpError = (code: number, message: string) =>
  throwError(() => new HttpErrorResponse({ status: code, error: { status: 'error', message } }));

describe('MyAttendancePageComponent', () => {
  const api = { effectiveStatus: vi.fn(), checkIn: vi.fn(), checkOut: vi.fn() };

  const setup = (): { fixture: ComponentFixture<MyAttendancePageComponent>; el: HTMLElement } => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AttendanceService, useValue: api },
        { provide: NotificationService, useValue: { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(MyAttendancePageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const button = (el: HTMLElement, label: string): HTMLButtonElement =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement;

  beforeEach(() => {
    api.effectiveStatus.mockReset();
    api.checkIn.mockReset();
    api.checkOut.mockReset();
  });

  it("asks for the caller's own status for the server's day on entry", () => {
    api.effectiveStatus.mockReturnValue(of(status('ABSENT', null)));
    setup();

    expect(api.effectiveStatus).toHaveBeenCalledTimes(1);
    expect(api.effectiveStatus).toHaveBeenCalledWith(new Date().toISOString().slice(0, 10));
  });

  it('shows the status badge, its explanation and the punches', () => {
    api.effectiveStatus.mockReturnValue(of(status('PRESENT', record())));
    const { el } = setup();

    expect(el.querySelector('app-attendance-status-badge')?.textContent).toContain('Present');
    expect(el.textContent).toContain('Checked in for the day.');
    expect(el.textContent).toContain('9:05');
  });

  it('offers Check in, not Check out, before checking in', () => {
    api.effectiveStatus.mockReturnValue(of(status('ABSENT', null)));
    const { el } = setup();

    expect(button(el, 'Check in').disabled).toBe(false);
    expect(button(el, 'Check out').disabled).toBe(true);
  });

  it('offers Check out, not Check in, once checked in', () => {
    api.effectiveStatus.mockReturnValue(of(status('PRESENT', record())));
    const { el } = setup();

    expect(button(el, 'Check in').disabled).toBe(true);
    expect(button(el, 'Check out').disabled).toBe(false);
  });

  it('checks in when the button is pressed and then shows the punch', () => {
    api.effectiveStatus.mockReturnValueOnce(of(status('ABSENT', null))).mockReturnValue(of(status('PRESENT', record())));
    api.checkIn.mockReturnValue(of(record()));
    const { fixture, el } = setup();

    button(el, 'Check in').click();
    fixture.detectChanges();

    expect(api.checkIn).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('9:05');
    expect(button(el, 'Check out').disabled).toBe(false);
  });

  it("shows the server's message inline when the action is refused", () => {
    api.effectiveStatus.mockReturnValue(of(status('ABSENT', null)));
    api.checkIn.mockReturnValue(httpError(409, 'Already checked in for today'));
    const { fixture, el } = setup();

    button(el, 'Check in').click();
    fixture.detectChanges();

    expect(el.textContent).toContain('Already checked in for today');
  });

  it('shows the "not linked" empty state, not an error banner, for an account with no employee record', () => {
    api.effectiveStatus.mockReturnValue(httpError(400, 'No employee record linked to this account'));
    const { el } = setup();

    expect(el.textContent).toContain("Your account isn't linked to an employee record");
    expect(el.querySelector('app-inline-banner')).toBeNull();
    expect(button(el, 'Check in')).toBeUndefined();
  });

  it('shows a load error with a Retry that asks again', () => {
    api.effectiveStatus.mockReturnValueOnce(httpError(500, 'boom')).mockReturnValue(of(status('ABSENT', null)));
    const { fixture, el } = setup();

    expect(el.querySelector('app-inline-banner')?.textContent).toContain('boom');

    button(el, 'Retry').click();
    fixture.detectChanges();

    expect(api.effectiveStatus).toHaveBeenCalledTimes(2);
    expect(el.querySelector('app-attendance-status-badge')?.textContent).toContain('Absent');
  });

  it('says so when the server day is not the local date, and stays quiet when they agree', () => {
    api.effectiveStatus.mockReturnValue(of(status('ABSENT', null)));
    const { el } = setup();

    // The store asks about the server's (UTC) day; the fixture answers 2026-09-15 either way, so
    // compare against the real local date: the note appears exactly when they differ.
    const local = new Date();
    const localDate = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    const noteShown = el.textContent?.includes("Attendance days follow the server's calendar") ?? false;

    expect(noteShown).toBe(localDate !== new Date().toISOString().slice(0, 10));
  });
});
