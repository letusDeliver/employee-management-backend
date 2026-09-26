import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EffectiveStatus } from '../data-access/attendance.models';
import { STATUS_META } from '../data-access/attendance-status';
import { AttendanceStatusBadgeComponent } from './attendance-status-badge.component';

describe('AttendanceStatusBadgeComponent', () => {
  const render = (status: EffectiveStatus): HTMLElement => {
    const fixture: ComponentFixture<AttendanceStatusBadgeComponent> = TestBed.createComponent(AttendanceStatusBadgeComponent);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it.for(Object.keys(STATUS_META) as EffectiveStatus[])('shows %s as a word AND a glyph, never colour alone', (status) => {
    const el = render(status);

    expect(el.querySelector('.badge-label')?.textContent?.trim()).toBe(STATUS_META[status].label);
    expect(el.querySelector('mat-icon')?.textContent?.trim()).toBe(STATUS_META[status].icon);
    expect(el.querySelector('mat-icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it("carries the status's tone as a class, so the colour follows the meaning", () => {
    expect(render('ABSENT').querySelector('.badge')?.classList.contains('badge-error')).toBe(true);
    expect(render('PRESENT').querySelector('.badge')?.classList.contains('badge-success')).toBe(true);
    expect(render('LATE').querySelector('.badge')?.classList.contains('badge-warning')).toBe(true);
    expect(render('WEEK_OFF').querySelector('.badge')?.classList.contains('badge-neutral')).toBe(true);
  });
});
