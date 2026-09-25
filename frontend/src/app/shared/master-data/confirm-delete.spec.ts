import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject, of, throwError } from 'rxjs';

import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { createConfirmDelete } from './confirm-delete';

describe('createConfirmDelete', () => {
  const dialog = { open: vi.fn() };
  const deleteById = vi.fn();
  const copy = { title: 'Delete thing', message: 'Delete "A"? Deactivate it instead.' };

  const setup = () => {
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: dialog }] });
    return TestBed.runInInjectionContext(() => createConfirmDelete(deleteById));
  };

  const answers = (confirmed: boolean | undefined) => dialog.open.mockReturnValue({ afterClosed: () => of(confirmed) });

  beforeEach(() => {
    dialog.open.mockReset();
    deleteById.mockReset();
  });

  it('asks with the given copy and a Delete button', () => {
    answers(false);

    setup().request('id-1', copy);

    expect(dialog.open).toHaveBeenCalledWith(ConfirmDialogComponent, {
      data: { ...copy, confirmLabel: 'Delete' },
    });
  });

  it.for([false, undefined])('does nothing when the answer is %s', (answer) => {
    answers(answer);
    const flow = setup();

    flow.request('id-1', copy);

    expect(deleteById).not.toHaveBeenCalled();
    expect(flow.deletingIds().size).toBe(0);
  });

  it('deletes only once confirmed, marks the row as deleting meanwhile, then clears it', () => {
    answers(true);
    const pending = new Subject<void>();
    deleteById.mockReturnValue(pending);
    const flow = setup();

    flow.request('id-1', copy);

    expect(deleteById).toHaveBeenCalledWith('id-1');
    expect(flow.deletingIds().has('id-1')).toBe(true);

    pending.next();
    pending.complete();

    expect(flow.deletingIds().has('id-1')).toBe(false);
    expect(flow.deleteError()).toBeNull();
  });

  it("keeps the backend's own message when the delete is refused, and clears the deleting mark", () => {
    answers(true);
    deleteById.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 409, error: { status: 'error', message: 'Branches reference it - deactivate it instead' } }),
      ),
    );
    const flow = setup();

    flow.request('id-1', copy);

    expect(flow.deleteError()).toContain('deactivate it instead');
    expect(flow.deletingIds().has('id-1')).toBe(false);
  });

  it('clears a previous error when the next delete starts', () => {
    answers(true);
    deleteById.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'boom' } })));
    const pending = new Subject<void>();
    deleteById.mockReturnValueOnce(pending);
    const flow = setup();

    flow.request('id-1', copy);
    expect(flow.deleteError()).toBe('boom');

    flow.request('id-2', copy);
    expect(flow.deleteError()).toBeNull();
  });
});
