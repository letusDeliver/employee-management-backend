import { TestBed } from '@angular/core/testing';

import { StatusPillComponent, StatusTone } from './status-pill.component';

describe('StatusPillComponent', () => {
  const render = (label: string, tone: StatusTone, icon: string): HTMLElement => {
    const fixture = TestBed.createComponent(StatusPillComponent);
    fixture.componentRef.setInput('label', label);
    fixture.componentRef.setInput('tone', tone);
    fixture.componentRef.setInput('icon', icon);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows the word AND a glyph, never colour alone, and hides the glyph from assistive tech', () => {
    const el = render('Pending', 'warning', 'hourglass_empty');

    expect(el.querySelector('.badge-label')?.textContent?.trim()).toBe('Pending');
    expect(el.querySelector('mat-icon')?.textContent?.trim()).toBe('hourglass_empty');
    expect(el.querySelector('mat-icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it.for(['success', 'warning', 'error', 'info', 'neutral'] as const)('carries the %s tone as a class', (tone) => {
    expect(render('x', tone, 'circle').querySelector('.badge')?.classList.contains(`badge-${tone}`)).toBe(true);
  });
});
