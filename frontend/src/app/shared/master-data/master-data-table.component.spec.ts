import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MasterDataRecord } from './master-data.models';
import { MasterDataTableComponent } from './master-data-table.component';

const rows: MasterDataRecord[] = [
  {
    id: 'r-1',
    name: 'Engineering',
    code: 'ENG',
    status: 'ACTIVE',
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
  },
  {
    id: 'r-2',
    name: 'Finance',
    code: null,
    status: 'INACTIVE',
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
  },
];

describe('MasterDataTableComponent', () => {
  const setup = (
    inputs: { canEdit?: boolean; canDelete?: boolean; deletingIds?: string[] } = {},
  ): { fixture: ComponentFixture<MasterDataTableComponent<MasterDataRecord>>; el: HTMLElement } => {
    const fixture = TestBed.createComponent(MasterDataTableComponent<MasterDataRecord>);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('pagination', { page: 1, limit: 10, total: 2, totalPages: 1 });
    fixture.componentRef.setInput('canEdit', inputs.canEdit ?? false);
    fixture.componentRef.setInput('canDelete', inputs.canDelete ?? false);
    fixture.componentRef.setInput('deletingIds', new Set(inputs.deletingIds ?? []));
    fixture.detectChanges();

    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  it('renders name, a dash for a missing code, and a status chip', () => {
    const { el } = setup();
    const bodyRows = el.querySelectorAll('tr.mat-mdc-row');

    expect(bodyRows).toHaveLength(2);
    expect(bodyRows[0].textContent).toContain('Engineering');
    expect(bodyRows[0].textContent).toContain('ENG');
    expect(bodyRows[0].textContent).toContain('Active');
    expect(bodyRows[1].textContent).toContain('—');
    expect(bodyRows[1].textContent).toContain('Inactive');
  });

  it('renders no action buttons unless told the caller may edit/delete', () => {
    const { el } = setup();

    expect(el.querySelectorAll('button[aria-label^="Edit "]')).toHaveLength(0);
    expect(el.querySelectorAll('button[aria-label^="Delete "]')).toHaveLength(0);
  });

  it('renders only the actions it is permitted to', () => {
    const { el } = setup({ canEdit: true });

    expect(el.querySelectorAll('button[aria-label^="Edit "]')).toHaveLength(2);
    expect(el.querySelectorAll('button[aria-label^="Delete "]')).toHaveLength(0);
  });

  it('labels each action with the row name and emits the row on click', () => {
    const { fixture, el } = setup({ canEdit: true, canDelete: true });
    const edited: MasterDataRecord[] = [];
    const deleted: MasterDataRecord[] = [];
    fixture.componentInstance.editRequested.subscribe((row) => edited.push(row));
    fixture.componentInstance.deleteRequested.subscribe((row) => deleted.push(row));

    el.querySelector<HTMLButtonElement>('button[aria-label="Edit Finance"]')!.click();
    el.querySelector<HTMLButtonElement>('button[aria-label="Delete Engineering"]')!.click();

    expect(edited.map((row) => row.id)).toEqual(['r-2']);
    expect(deleted.map((row) => row.id)).toEqual(['r-1']);
  });

  it('swaps the Delete button for a spinner while that row is being deleted', () => {
    const { el } = setup({ canDelete: true, deletingIds: ['r-1'] });

    expect(el.querySelector('button[aria-label="Delete Engineering"]')).toBeNull();
    expect(el.querySelector('mat-progress-spinner[aria-label="Deleting Engineering"]')).not.toBeNull();
    expect(el.querySelector('button[aria-label="Delete Finance"]')).not.toBeNull();
  });
});
