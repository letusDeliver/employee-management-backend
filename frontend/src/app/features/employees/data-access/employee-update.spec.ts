import { buildEmployeeCreate, buildEmployeeUpdate, EmployeeFormValue } from './employee-update';
import { makeEmployee } from './employee.testing';

const formFor = (overrides: Partial<EmployeeFormValue> = {}): EmployeeFormValue => ({
  departmentId: 'dep-1',
  designationId: 'des-1',
  employmentType: 'FULL_TIME',
  salary: 1000,
  dateOfJoining: new Date(2024, 0, 1),
  branchId: '',
  shiftId: '',
  userId: '',
  managerId: '',
  ...overrides,
});

describe('buildEmployeeUpdate - a PATCH body with only what changed', () => {
  const original = makeEmployee();

  it('is empty when nothing changed (the caller then sends no request at all)', () => {
    expect(buildEmployeeUpdate(original, formFor())).toEqual({});
  });

  it('THE CRUX: an unchanged departmentId/designationId/branchId/shiftId is never resent, so a since-deactivated one cannot fail an unrelated edit', () => {
    const withLinks = makeEmployee({ branchId: 'br-1', shiftId: 'sh-1', managerId: 'emp-2', userId: 'u-1' });

    const body = buildEmployeeUpdate(
      withLinks,
      formFor({ salary: 2000, branchId: 'br-1', shiftId: 'sh-1', managerId: 'emp-2', userId: 'u-1' }),
    );

    expect(body).toEqual({ salary: 2000 });
    expect(body).not.toHaveProperty('departmentId');
    expect(body).not.toHaveProperty('designationId');
    expect(body).not.toHaveProperty('branchId');
    expect(body).not.toHaveProperty('shiftId');
  });

  it('includes a department that actually changed - and only that', () => {
    expect(buildEmployeeUpdate(original, formFor({ departmentId: 'dep-2' }))).toEqual({ departmentId: 'dep-2' });
  });

  it('includes a designation that actually changed', () => {
    expect(buildEmployeeUpdate(original, formFor({ designationId: 'des-2' }))).toEqual({ designationId: 'des-2' });
  });

  it('includes changed employment type and salary', () => {
    expect(buildEmployeeUpdate(original, formFor({ employmentType: 'CONTRACT', salary: 5000 }))).toEqual({
      employmentType: 'CONTRACT',
      salary: 5000,
    });
  });

  it('treats the same calendar day at another time-of-day as unchanged, and a different day as changed', () => {
    expect(buildEmployeeUpdate(original, formFor({ dateOfJoining: new Date(2024, 0, 1, 15, 30) }))).toEqual({});

    const moved = new Date(2024, 0, 2);
    expect(buildEmployeeUpdate(original, formFor({ dateOfJoining: moved }))).toEqual({ dateOfJoining: moved });
  });

  describe('optional links: a new id, null to clear, absent to leave', () => {
    it('sets a branch that was previously none', () => {
      expect(buildEmployeeUpdate(original, formFor({ branchId: 'br-2' }))).toEqual({ branchId: 'br-2' });
    });

    it('CLEARS a branch with null (not by omitting it, which would mean "leave it")', () => {
      const withBranch = makeEmployee({ branchId: 'br-1' });

      const body = buildEmployeeUpdate(withBranch, formFor({ branchId: '' }));

      expect(body).toEqual({ branchId: null });
      expect(body.branchId).toBeNull();
    });

    it('leaves an unchanged branch out', () => {
      expect(buildEmployeeUpdate(makeEmployee({ branchId: 'br-1' }), formFor({ branchId: 'br-1' }))).toEqual({});
    });

    it('treats a blank field and a null original as the same thing - no change', () => {
      expect(buildEmployeeUpdate(makeEmployee({ branchId: null, userId: null, managerId: null }), formFor())).toEqual({});
    });

    it('applies the same rule to the linked user and the manager', () => {
      const linked = makeEmployee({ userId: 'u-1', managerId: 'emp-2' });

      expect(buildEmployeeUpdate(linked, formFor({ userId: '', managerId: 'emp-3' }))).toEqual({
        userId: null,
        managerId: 'emp-3',
      });
    });
  });

  describe('shift (an optional link, same rule as branch)', () => {
    it('sets a shift that was previously none', () => {
      expect(buildEmployeeUpdate(original, formFor({ shiftId: 'sh-2' }))).toEqual({ shiftId: 'sh-2' });
    });

    it('changes to another shift', () => {
      expect(buildEmployeeUpdate(makeEmployee({ shiftId: 'sh-1' }), formFor({ shiftId: 'sh-2' }))).toEqual({ shiftId: 'sh-2' });
    });

    it('CLEARS a shift with null (choosing "No shift"), not by omitting it', () => {
      const body = buildEmployeeUpdate(makeEmployee({ shiftId: 'sh-1' }), formFor({ shiftId: '' }));

      expect(body).toEqual({ shiftId: null });
      expect(body.shiftId).toBeNull();
    });

    it('leaves an unchanged shift out even when other fields changed - it may have been deactivated since', () => {
      const body = buildEmployeeUpdate(makeEmployee({ shiftId: 'sh-old' }), formFor({ shiftId: 'sh-old', salary: 9 }));

      expect(body).toEqual({ salary: 9 });
    });

    it('treats a blank field and a null original as no change', () => {
      expect(buildEmployeeUpdate(makeEmployee({ shiftId: null }), formFor({ shiftId: '' }))).toEqual({});
    });
  });
});

describe('buildEmployeeCreate', () => {
  it('sends the mandatory ids and enum, and OMITS blank optional links (create never sends null)', () => {
    const body = buildEmployeeCreate(formFor());

    expect(body).toMatchObject({ departmentId: 'dep-1', designationId: 'des-1', employmentType: 'FULL_TIME', salary: 1000 });
    expect(body.branchId).toBeUndefined();
    expect(body.shiftId).toBeUndefined();
    expect(body.userId).toBeUndefined();
    expect(body.managerId).toBeUndefined();
  });

  it('includes optional links that were chosen', () => {
    const body = buildEmployeeCreate(formFor({ branchId: 'br-1', shiftId: 'sh-1', userId: 'u-1', managerId: 'emp-2' }));

    expect(body).toMatchObject({ branchId: 'br-1', shiftId: 'sh-1', userId: 'u-1', managerId: 'emp-2' });
  });

  it('omits a blank shift', () => {
    expect(buildEmployeeCreate(formFor()).shiftId).toBeUndefined();
  });
});
