import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Shift } from '../data-access/shift.models';
import { ShiftTableComponent } from './shift-table.component';

const rows: Shift[] = [
  {
    id: 'sh-1',
    name: 'Day Shift',
    startTime: '09:00',
    endTime: '18:00',
    workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    status: 'ACTIVE',
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z',
  },
  {
    id: 'sh-2',
    name: 'Night Shift',
    startTime: '22:00',
    endTime: '06:00',
    workingDays: ['SATURDAY', 'SUNDAY'],
    status: 'INACTIVE',
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
  },
];

describe('ShiftTableComponent', () => {
  const setup = (
    inputs: { canEdit?: boolean; canDelete?: boolean; deletingIds?: string[] } = {},
  ): { fixture: ComponentFixture<ShiftTableComponent>; el: HTMLElement } => {
    const fixture = TestBed.createComponent(ShiftTableComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('pagination', { page: 1, limit: 10, total: 2, totalPages: 1 });
    fixture.componentRef.setInput('canEdit', inputs.canEdit ?? false);
    fixture.componentRef.setInput('canDelete', inputs.canDelete ?? false);
    fixture.componentRef.setInput('deletingIds', new Set(inputs.deletingIds ?? []));
    fixture.detectChanges();

    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  it('renders name, a compact working-days summary, the hours range and a status chip', () => {
    const { el } = setup();
    const bodyRows = el.querySelectorAll('tr.mat-mdc-row');

    expect(bodyRows).toHaveLength(2);
    expect(bodyRows[0].textContent).toContain('Day Shift');
    expect(bodyRows[0].textContent).toContain('Mon–Fri');
    expect(bodyRows[0].textContent).toContain('09:00 – 18:00');
    expect(bodyRows[0].textContent).toContain('Active');
    expect(bodyRows[1].textContent).toContain('Sat, Sun');
    expect(bodyRows[1].textContent).toContain('Inactive');
  });

  it('flags only the overnight shift with "(next day)"', () => {
    const { el } = setup();
    const bodyRows = el.querySelectorAll('tr.mat-mdc-row');

    expect(bodyRows[0].textContent).not.toContain('(next day)');
    expect(bodyRows[1].textContent).toContain('22:00 – 06:00');
    expect(bodyRows[1].textContent).toContain('(next day)');
  });

  it('has no Code column - Shift has no code', () => {
    const { el } = setup();

    expect(el.querySelector('thead')?.textContent).not.toContain('Code');
  });

  it('renders no action buttons unless told the caller may edit/delete', () => {
    const { el } = setup();

    expect(el.querySelectorAll('button[aria-label^="Edit "]')).toHaveLength(0);
    expect(el.querySelectorAll('button[aria-label^="Delete "]')).toHaveLength(0);
  });

  it('labels each action with the row name and emits the row on click', () => {
    const { fixture, el } = setup({ canEdit: true, canDelete: true });
    const edited: Shift[] = [];
    const deleted: Shift[] = [];
    fixture.componentInstance.editRequested.subscribe((row) => edited.push(row));
    fixture.componentInstance.deleteRequested.subscribe((row) => deleted.push(row));

    el.querySelector<HTMLButtonElement>('button[aria-label="Edit Night Shift"]')!.click();
    el.querySelector<HTMLButtonElement>('button[aria-label="Delete Day Shift"]')!.click();

    expect(edited.map((row) => row.id)).toEqual(['sh-2']);
    expect(deleted.map((row) => row.id)).toEqual(['sh-1']);
  });

  it('swaps the Delete button for a spinner while that row is being deleted', () => {
    const { el } = setup({ canDelete: true, deletingIds: ['sh-1'] });

    expect(el.querySelector('button[aria-label="Delete Day Shift"]')).toBeNull();
    expect(el.querySelector('mat-progress-spinner[aria-label="Deleting Day Shift"]')).not.toBeNull();
    expect(el.querySelector('button[aria-label="Delete Night Shift"]')).not.toBeNull();
  });
});
