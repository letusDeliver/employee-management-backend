import { toCreateEmployeeRequestDto, toDateOnlyString, toEmployeeModel, toUpdateEmployeeRequestDto } from './employee.mapper';
import { makeEmployeeDto } from './employee.testing';

// The test runtime is Node, but the app's spec tsconfig deliberately has no Node typings.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

describe('employee mapper', () => {
  describe('toEmployeeModel', () => {
    it('maps the real wire shape: bare foreign keys, enum, nullable links, and a numeric salary', () => {
      const model = toEmployeeModel(
        makeEmployeeDto({
          userId: 'u-1',
          managerId: 'emp-9',
          branchId: 'br-1',
          shiftId: 'sh-1',
          employmentType: 'CONTRACT',
          salary: '85000.5',
        }),
      );

      expect(model).toMatchObject({
        id: 'emp-1',
        userId: 'u-1',
        departmentId: 'dep-1',
        designationId: 'des-1',
        employmentType: 'CONTRACT',
        managerId: 'emp-9',
        branchId: 'br-1',
        shiftId: 'sh-1',
        salary: 85000.5,
      });
      expect(typeof model.salary).toBe('number');
    });

    it('round-trips shiftId even though no UI reads or writes it yet', () => {
      expect(toEmployeeModel(makeEmployeeDto({ shiftId: 'sh-7' })).shiftId).toBe('sh-7');
      expect(toEmployeeModel(makeEmployeeDto({ shiftId: null })).shiftId).toBeNull();
    });

    it('does NOT carry the retired free-text fields', () => {
      const model = toEmployeeModel(makeEmployeeDto()) as unknown as Record<string, unknown>;

      expect(model).not.toHaveProperty('department');
      expect(model).not.toHaveProperty('jobTitle');
    });

    it('reads dateOfJoining as a LOCAL calendar date - the day the API says, in any timezone', () => {
      // The API returns a date-only value as an ISO instant at UTC midnight.
      const { dateOfJoining } = toEmployeeModel(makeEmployeeDto({ dateOfJoining: '2024-01-01T00:00:00.000Z' }));

      expect([dateOfJoining.getFullYear(), dateOfJoining.getMonth(), dateOfJoining.getDate()]).toEqual([2024, 0, 1]);
      expect(dateOfJoining.getHours()).toBe(0);
    });

    it.for(['America/New_York', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Kolkata', 'UTC'])(
      'does not drift the date of joining in %s',
      (zone, { skip }) => {
        const original = env['TZ'];
        env['TZ'] = zone;

        try {
          // Prove the zone change actually took effect in this runtime; otherwise this
          // test could not have failed and must not pretend to have passed.
          const probe = new Date('2024-01-01T00:00:00.000Z');
          const expectedLocalDay = zone.startsWith('America/') ? 31 : 1;
          if (probe.getDate() !== expectedLocalDay) {
            skip('the runtime did not honour a TZ change');
          }

          const { dateOfJoining } = toEmployeeModel(makeEmployeeDto({ dateOfJoining: '2024-01-01T00:00:00.000Z' }));

          expect(toDateOnlyString(dateOfJoining)).toBe('2024-01-01');
        } finally {
          if (original === undefined) {
            delete env['TZ'];
          } else {
            env['TZ'] = original;
          }
        }
      },
    );
  });

  describe('toCreateEmployeeRequestDto', () => {
    it('sends foreign keys and the enum, a numeric salary, and a date-only string', () => {
      const dto = toCreateEmployeeRequestDto({
        departmentId: 'dep-1',
        designationId: 'des-1',
        employmentType: 'INTERN',
        salary: 1234.5,
        dateOfJoining: new Date(2024, 2, 5),
      });

      expect(dto).toMatchObject({
        departmentId: 'dep-1',
        designationId: 'des-1',
        employmentType: 'INTERN',
        salary: 1234.5,
        dateOfJoining: '2024-03-05',
      });
    });

    it('leaves absent optional links out of the JSON body entirely (create omits, never nulls)', () => {
      const dto = toCreateEmployeeRequestDto({
        departmentId: 'dep-1',
        designationId: 'des-1',
        employmentType: 'FULL_TIME',
        salary: 1,
        dateOfJoining: new Date(2024, 0, 1),
      });

      const body = JSON.parse(JSON.stringify(dto)) as Record<string, unknown>;
      expect(body).not.toHaveProperty('userId');
      expect(body).not.toHaveProperty('managerId');
      expect(body).not.toHaveProperty('branchId');
      expect(body).not.toHaveProperty('shiftId');
    });

    it('sends a chosen shift', () => {
      const dto = toCreateEmployeeRequestDto({
        departmentId: 'dep-1',
        designationId: 'des-1',
        employmentType: 'FULL_TIME',
        salary: 1,
        dateOfJoining: new Date(2024, 0, 1),
        shiftId: 'sh-1',
      });

      expect(dto.shiftId).toBe('sh-1');
    });

    it('never sends the retired free-text fields', () => {
      const body = JSON.parse(
        JSON.stringify(
          toCreateEmployeeRequestDto({
            departmentId: 'dep-1',
            designationId: 'des-1',
            employmentType: 'FULL_TIME',
            salary: 1,
            dateOfJoining: new Date(2024, 0, 1),
          }),
        ),
      ) as Record<string, unknown>;

      expect(body).not.toHaveProperty('department');
      expect(body).not.toHaveProperty('jobTitle');
    });
  });

  describe('toUpdateEmployeeRequestDto', () => {
    it('passes through only the keys it was given', () => {
      const body = JSON.parse(JSON.stringify(toUpdateEmployeeRequestDto({ salary: 2000 }))) as Record<string, unknown>;

      expect(body).toEqual({ salary: 2000 });
    });

    it('preserves an explicit null (clear this link) - distinct from an omitted key (leave it)', () => {
      const body = JSON.parse(JSON.stringify(toUpdateEmployeeRequestDto({ branchId: null, managerId: null }))) as Record<
        string,
        unknown
      >;

      expect(body).toEqual({ branchId: null, managerId: null });
    });

    it('preserves a shift id and an explicit null shift (clear it)', () => {
      const set = JSON.parse(JSON.stringify(toUpdateEmployeeRequestDto({ shiftId: 'sh-1' }))) as Record<string, unknown>;
      const cleared = JSON.parse(JSON.stringify(toUpdateEmployeeRequestDto({ shiftId: null }))) as Record<string, unknown>;

      expect(set).toEqual({ shiftId: 'sh-1' });
      expect(cleared).toEqual({ shiftId: null });
    });

    it('converts a Date to a date-only string and sends nothing else', () => {
      const body = JSON.parse(JSON.stringify(toUpdateEmployeeRequestDto({ dateOfJoining: new Date(2024, 11, 25) }))) as Record<
        string,
        unknown
      >;

      expect(body).toEqual({ dateOfJoining: '2024-12-25' });
    });
  });

  it('a date survives parse -> display -> re-send unchanged (no drift on save)', () => {
    const model = toEmployeeModel(makeEmployeeDto({ dateOfJoining: '2023-07-15T00:00:00.000Z' }));

    expect(toDateOnlyString(model.dateOfJoining)).toBe('2023-07-15');
  });
});
