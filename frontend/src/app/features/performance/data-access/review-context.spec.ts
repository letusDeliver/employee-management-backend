import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { UserDirectoryService } from '../../../core/users/user-directory.service';
import { review } from './performance.testing';
import { ReviewContext } from './review-context';

const ADMIN_KEYS = ['employee:read:any', 'performanceReview:manage:any', 'performanceReview:read:any'];
const MANAGER_KEYS = ['employee:read:any', 'performanceReview:manage:reports', 'performanceReview:read:own'];
const EMPLOYEE_KEYS = ['performanceReview:read:own'];

describe('ReviewContext', () => {
  const directory = {
    refresh: vi.fn(),
    ownEmployeeId: vi.fn(),
    labelOf: (id: string) => `label:${id}`,
    entries: signal([{ id: 'e-mgr', userId: 'u-mgr' }]),
  };
  const users = { resolveDisplayName: vi.fn((id: string) => (id === 'u-admin' ? 'Ada Admin' : null)) };

  const setup = (keys: string[], userId = 'u-me') => {
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionStore, useValue: { user: signal({ id: userId }), hasAnyPermission: (...k: string[]) => k.some((x) => keys.includes(x)) } },
        { provide: EmployeeDirectoryService, useValue: directory },
        { provide: UserDirectoryService, useValue: users },
      ],
    });
    return TestBed.inject(ReviewContext);
  };

  beforeEach(() => {
    directory.refresh.mockReset().mockReturnValue(of([]));
    directory.ownEmployeeId.mockReset();
  });

  it('resolves ADMIN/MANAGER own employee id from the directory', () => {
    directory.ownEmployeeId.mockReturnValue('e-mgr');
    const context = setup(MANAGER_KEYS, 'u-mgr');

    context.load().subscribe();

    expect(context.ownEmployeeId()).toBe('e-mgr');
    expect(context.ownState()).toBe('known');
    expect(context.actorFor(review())).toEqual({ manageAny: false, manageReports: true, ownEmployeeId: 'e-mgr' });
  });

  it('a failed directory load is "failed", never guessed', () => {
    directory.refresh.mockReturnValue(throwError(() => new Error('down')));
    const context = setup(ADMIN_KEYS);

    context.load().subscribe();

    expect(context.ownState()).toBe('failed');
    expect(context.actorFor(review()).ownEmployeeId).toBeNull();
  });

  it('an EMPLOYEE never calls the directory; a review the server returned to them is theirs', () => {
    const context = setup(EMPLOYEE_KEYS);

    context.load().subscribe();

    expect(directory.refresh).not.toHaveBeenCalled();
    expect(context.actorFor(review({ employeeId: 'e-emp' })).ownEmployeeId).toBe('e-emp');
    expect(context.actorFor(null).ownEmployeeId).toBeNull();
  });

  it('a MANAGER is NOT assumed to be the subject of a review they can load (they can load their reports\')', () => {
    directory.ownEmployeeId.mockReturnValue(null);
    const context = setup(MANAGER_KEYS);
    context.load().subscribe();

    expect(context.actorFor(review({ employeeId: 'e-emp' })).ownEmployeeId).toBeNull();
  });

  describe('labels - never an id', () => {
    it('EMPLOYEE: "You" and "Your reviewer"', () => {
      const context = setup(EMPLOYEE_KEYS);
      const r = review();
      const actor = context.actorFor(r);

      expect(context.subjectLabel(r, actor)).toBe('You');
      expect(context.reviewerLabel(r, actor)).toBe('Your reviewer');
    });

    it('MANAGER/ADMIN: the directory label, and "You" for themselves', () => {
      directory.ownEmployeeId.mockReturnValue('e-mgr');
      const context = setup(MANAGER_KEYS, 'u-mgr');
      context.load().subscribe();
      const r = review();
      const actor = context.actorFor(r);

      expect(context.subjectLabel(r, actor)).toBe('label:e-emp');
      expect(context.reviewerLabel(r, actor)).toBe('You');
    });

    it('a note author: "You", an employee label, an ADMIN user name, "Someone else", or "A removed user"', () => {
      const context = setup(ADMIN_KEYS, 'u-me');

      expect(context.authorLabel('u-me')).toBe('You');
      expect(context.authorLabel('u-mgr')).toBe('label:e-mgr');
      expect(context.authorLabel('u-admin')).toBe('Ada Admin');
      expect(context.authorLabel('u-unknown')).toBe('Someone else');
      expect(context.authorLabel(null)).toBe('A removed user');
    });

    it('an EMPLOYEE cannot look anyone up: another author is "Someone else"', () => {
      const context = setup(EMPLOYEE_KEYS, 'u-emp');

      expect(context.authorLabel('u-emp')).toBe('You');
      expect(context.authorLabel('u-mgr')).toBe('Someone else');
    });
  });
});
