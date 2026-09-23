import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { MasterDataFormDialogComponent, MasterDataFormDialogData } from './master-data-form-dialog.component';
import { MasterDataRecord } from './master-data.models';

const existing: MasterDataRecord = {
  id: 'r-1',
  name: 'Engineering',
  code: 'ENG',
  status: 'ACTIVE',
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z',
};

describe('MasterDataFormDialogComponent', () => {
  const store = {
    labels: { singular: 'Widget', plural: 'Widgets' },
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
  };
  const dialogRef = { close: vi.fn() };

  const setup = (record: MasterDataRecord | null): ComponentFixture<MasterDataFormDialogComponent> => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { record, store } as unknown as MasterDataFormDialogData },
      ],
    });

    const fixture = TestBed.createComponent(MasterDataFormDialogComponent);
    fixture.detectChanges();
    return fixture;
  };

  const root = (fixture: ComponentFixture<MasterDataFormDialogComponent>) => fixture.nativeElement as HTMLElement;

  const type = (fixture: ComponentFixture<MasterDataFormDialogComponent>, control: string, value: string) => {
    const input = root(fixture).querySelector<HTMLInputElement>(`input[formcontrolname=${control}]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  const submit = (fixture: ComponentFixture<MasterDataFormDialogComponent>) => {
    root(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    store.createRecord.mockReset();
    store.updateRecord.mockReset();
    dialogRef.close.mockReset();
  });

  describe('create mode', () => {
    it('has no Status field and takes all its wording from the store labels', () => {
      const fixture = setup(null);

      expect(root(fixture).querySelector('mat-select')).toBeNull();
      expect(root(fixture).querySelector('h2')?.textContent).toContain('New Widget');
      expect(root(fixture).querySelector('button[type=submit]')?.textContent).toContain('Create Widget');
    });

    it('omits an empty code and trims the name, then closes with the created record', () => {
      store.createRecord.mockReturnValue(of(existing));
      const fixture = setup(null);

      type(fixture, 'name', '  Engineering  ');
      submit(fixture);

      expect(store.createRecord).toHaveBeenCalledWith({ name: 'Engineering', code: undefined });
      expect(dialogRef.close).toHaveBeenCalledWith(existing);
    });

    it('sends a code when one was entered', () => {
      store.createRecord.mockReturnValue(of(existing));
      const fixture = setup(null);

      type(fixture, 'name', 'Engineering');
      type(fixture, 'code', ' ENG ');
      submit(fixture);

      expect(store.createRecord).toHaveBeenCalledWith({ name: 'Engineering', code: 'ENG' });
    });

    it('blocks a blank name client-side: no request, a labelled error shown, dialog stays open', () => {
      const fixture = setup(null);

      type(fixture, 'name', '   ');
      submit(fixture);

      expect(store.createRecord).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(root(fixture).textContent).toContain('Widget name is required.');
    });

    it("shows the backend's message in the banner and keeps the dialog open on failure", () => {
      store.createRecord.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { status: 'error', message: 'A widget with this name or code already exists' },
            }),
        ),
      );
      const fixture = setup(null);

      type(fixture, 'name', 'Engineering');
      submit(fixture);

      expect(root(fixture).querySelector('app-inline-banner')?.textContent).toContain(
        'A widget with this name or code already exists',
      );
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(root(fixture).querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false);
    });
  });

  describe('edit mode', () => {
    it('prefills the form, shows Status, and words the hint from the plural label', () => {
      const fixture = setup(existing);

      expect(root(fixture).querySelector<HTMLInputElement>('input[formcontrolname=name]')!.value).toBe('Engineering');
      expect(root(fixture).querySelector<HTMLInputElement>('input[formcontrolname=code]')!.value).toBe('ENG');
      expect(root(fixture).querySelector('mat-select')).not.toBeNull();
      expect(root(fixture).querySelector('h2')?.textContent).toContain('Edit Widget');
      expect(root(fixture).querySelector('mat-hint')?.textContent).toContain(
        "Inactive widgets can't be assigned to employees.",
      );
    });

    it('sends null (not omitted) when the code is cleared, so the server actually clears it', () => {
      store.updateRecord.mockReturnValue(of({ ...existing, code: null }));
      const fixture = setup(existing);

      type(fixture, 'code', '');
      submit(fixture);

      expect(store.updateRecord).toHaveBeenCalledWith('r-1', {
        name: 'Engineering',
        code: null,
        status: 'ACTIVE',
      });
      expect(dialogRef.close).toHaveBeenCalled();
    });
  });
});
