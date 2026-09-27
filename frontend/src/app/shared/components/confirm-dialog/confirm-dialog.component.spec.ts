import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  const dialogRef = { close: vi.fn() };

  const setup = (data: ConfirmDialogData) => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  beforeEach(() => dialogRef.close.mockReset());

  it('shows the title, the message and the default labels - and no warning banner unless one is given', () => {
    const el = setup({ title: 'Delete branch?', message: 'This cannot be undone.' });

    expect(el.querySelector('h2')?.textContent).toContain('Delete branch?');
    expect(el.textContent).toContain('This cannot be undone.');
    expect(el.textContent).toContain('Cancel');
    expect(el.textContent).toContain('Confirm');
    expect(el.querySelector('app-inline-banner')).toBeNull();
  });

  it('shows an optional warning as a warning banner under the message', () => {
    const el = setup({ title: 'Process?', message: 'Irreversible.', warning: "August hasn't ended yet." });

    const banner = el.querySelector('app-inline-banner');
    expect(banner?.textContent).toContain("August hasn't ended yet.");
    expect(banner?.querySelector('.banner-warning')).not.toBeNull();
  });

  it('closes with true on confirm and false on cancel', () => {
    const el = setup({ title: 'T', message: 'M', confirmLabel: 'Go' });
    const buttons = [...el.querySelectorAll('button')];

    buttons.find((b) => b.textContent?.includes('Go'))!.click();
    expect(dialogRef.close).toHaveBeenLastCalledWith(true);
    buttons.find((b) => b.textContent?.includes('Cancel'))!.click();
    expect(dialogRef.close).toHaveBeenLastCalledWith(false);
  });
});
