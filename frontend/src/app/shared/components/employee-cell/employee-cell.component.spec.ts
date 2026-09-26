import { TestBed } from '@angular/core/testing';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { EmployeeCellComponent } from './employee-cell.component';

describe('EmployeeCellComponent', () => {
  // e-1 has a resolvable name (an ADMIN's view); e-2 has none (a MANAGER's view).
  const directory = {
    labelOf: (id: string | null) => (id === 'e-1' ? 'Amit Rao' : 'Engineer, Sales'),
    personNameOf: (id: string | null) => (id === 'e-1' ? 'Amit Rao' : null),
    detailOf: () => 'Joined Jan 5, 2024',
  };

  const render = (employeeId: string | null): string => {
    TestBed.configureTestingModule({ providers: [{ provide: EmployeeDirectoryService, useValue: directory }] });
    const fixture = TestBed.createComponent(EmployeeCellComponent);
    fixture.componentRef.setInput('employeeId', employeeId);
    fixture.detectChanges();
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim();
  };

  it("shows just the name when the employee's name is known", () => {
    expect(render('e-1')).toBe('Amit Rao');
  });

  it('adds the joining-date line when there is no resolvable name, so nameless people can be told apart', () => {
    expect(render('e-2')).toBe('Engineer, Sales Joined Jan 5, 2024');
  });
});
