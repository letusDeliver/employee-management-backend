import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PerformanceReview } from '../data-access/performance.models';
import { MANAGER, review } from '../data-access/performance.testing';
import { ReviewContext } from '../data-access/review-context';
import { ReviewCycleLookup } from '../data-access/review-cycle-lookup';
import { ReviewLedgerTableComponent } from './review-ledger-table.component';

describe('ReviewLedgerTableComponent', () => {
  const setup = (rows: PerformanceReview[]) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ReviewContext,
          useValue: {
            actorFor: () => MANAGER,
            subjectLabel: (r: PerformanceReview) => (r.employeeId === 'e-mgr' ? 'You' : 'Asha Rao'),
            reviewerLabel: (r: PerformanceReview) => (r.reviewerId === 'e-mgr' ? 'You' : 'Dev Director'),
          },
        },
        { provide: ReviewCycleLookup, useValue: { nameOf: () => 'H1 2026' } },
      ],
    });
    const fixture = TestBed.createComponent(ReviewLedgerTableComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('pagination', { page: 1, limit: 10, total: rows.length, totalPages: 1 });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const cells = (el: HTMLElement, row: number) =>
    [...el.querySelectorAll('tr.mat-mdc-row')[row].querySelectorAll('td')].map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim());

  it('labels a review about the caller "About you" and hides its DRAFT rating; shows the rating of one they write', () => {
    const el = setup([
      review({ id: 'mine', employeeId: 'e-mgr', reviewerId: 'e-dir', rating: 'OUTSTANDING' }),
      review({ id: 'theirs', rating: 'MEETS_EXPECTATIONS' }),
    ]);

    const first = el.querySelectorAll('tr.mat-mdc-row')[0];
    expect(first.querySelector('.subject')?.textContent?.trim()).toBe('You');
    expect(first.querySelector('.about-you')?.textContent?.trim()).toBe('About you');
    expect(cells(el, 0).slice(1, 5)).toEqual(['H1 2026', 'Dev Director', expect.stringContaining('Draft'), '—']);
    expect(el.querySelectorAll('tr.mat-mdc-row')[1].querySelector('.about-you')).toBeNull();
    expect(cells(el, 1).slice(0, 5)).toEqual(['Asha Rao', 'H1 2026', 'You', expect.stringContaining('Draft'), 'Meets expectations']);
    expect(el.querySelector('a[mat-icon-button]')?.getAttribute('href')).toBe('/performance-reviews/mine');
  });
});
