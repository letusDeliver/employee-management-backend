import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import holidayCalendarService from './holidayCalendar.service.js';
import branchService from '../branches/branch.service.js';

// Integration coverage for the Holiday Calendar domain
// (docs/domain-holiday-calendar.md). Runs against the real dev database -
// fixtures are namespaced per run and fully cleaned up in `after`, same
// convention as every other domain suite in this project.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };
const createdCalendarIds = [];
const createdBranchIds = [];

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `holiday-calendar-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Holiday Calendar Test Actor',
    },
  });
  actor.id = user.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
  if (createdBranchIds.length) {
    await prisma.branch.deleteMany({ where: { id: { in: createdBranchIds } } });
  }
  if (createdCalendarIds.length) {
    await prisma.holidayCalendar.deleteMany({ where: { id: { in: createdCalendarIds } } });
  }
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
});

test('creates a holiday calendar and rejects a duplicate name', async () => {
  const calendar = await holidayCalendarService.createHolidayCalendar(
    { name: `India Public Holidays ${RUN_ID}` },
    actor,
  );
  createdCalendarIds.push(calendar.id);

  assert.equal(calendar.status, 'ACTIVE');

  await assert.rejects(
    () =>
      holidayCalendarService.createHolidayCalendar(
        { name: `India Public Holidays ${RUN_ID}` },
        actor,
      ),
    { message: 'A holiday calendar with this name already exists' },
  );
});

test('lists holiday calendars with pagination and search', async () => {
  const calendar = await holidayCalendarService.createHolidayCalendar(
    { name: `US Public Holidays ${RUN_ID}` },
    actor,
  );
  createdCalendarIds.push(calendar.id);

  const { holidayCalendars, pagination } = await holidayCalendarService.listHolidayCalendars({
    page: 1,
    limit: 10,
    search: `US Public Holidays ${RUN_ID}`,
    sortBy: 'createdAt',
    order: 'desc',
  });

  assert.equal(pagination.total, 1);
  assert.equal(holidayCalendars[0].id, calendar.id);
});

test('adds a holiday entry and rejects a duplicate date within the same calendar', async () => {
  const calendar = await holidayCalendarService.createHolidayCalendar(
    { name: `Duplicate Date Test Calendar ${RUN_ID}` },
    actor,
  );
  createdCalendarIds.push(calendar.id);

  const holiday = await holidayCalendarService.addHoliday(
    calendar.id,
    { date: new Date('2026-08-15'), name: 'Independence Day' },
    actor,
  );

  assert.equal(holiday.name, 'Independence Day');
  assert.equal(holiday.isOptional, false);

  await assert.rejects(
    () =>
      holidayCalendarService.addHoliday(
        calendar.id,
        { date: new Date('2026-08-15'), name: 'Duplicate Entry' },
        actor,
      ),
    { message: 'A holiday already exists on this date in this calendar' },
  );
});

test('isDateHolidayInCalendar resolves true for a matching date, false otherwise', async () => {
  const calendar = await holidayCalendarService.createHolidayCalendar(
    { name: `Resolution Query Test Calendar ${RUN_ID}` },
    actor,
  );
  createdCalendarIds.push(calendar.id);

  await holidayCalendarService.addHoliday(
    calendar.id,
    { date: new Date('2026-10-02'), name: 'Gandhi Jayanti' },
    actor,
  );

  const isHoliday = await holidayCalendarService.isDateHolidayInCalendar(
    calendar.id,
    new Date('2026-10-02'),
  );
  const isNotHoliday = await holidayCalendarService.isDateHolidayInCalendar(
    calendar.id,
    new Date('2026-10-03'),
  );

  assert.equal(isHoliday, true);
  assert.equal(isNotHoliday, false);
});

test('updating and removing a holiday entry works without any reference restriction', async () => {
  const calendar = await holidayCalendarService.createHolidayCalendar(
    { name: `Edit Remove Test Calendar ${RUN_ID}` },
    actor,
  );
  createdCalendarIds.push(calendar.id);

  const holiday = await holidayCalendarService.addHoliday(
    calendar.id,
    { date: new Date('2026-12-25'), name: 'Christms', isOptional: false },
    actor,
  );

  const updated = await holidayCalendarService.updateHoliday(
    calendar.id,
    holiday.id,
    { name: 'Christmas' },
    actor,
  );
  assert.equal(updated.name, 'Christmas');

  await holidayCalendarService.removeHoliday(calendar.id, holiday.id, actor);

  const remaining = await holidayCalendarService.listHolidays(calendar.id);
  assert.equal(remaining.length, 0);
});

test('deactivating a calendar blocks future Branch assignment but keeps existing links intact', async () => {
  const calendar = await holidayCalendarService.createHolidayCalendar(
    { name: `Deactivation Test Calendar ${RUN_ID}` },
    actor,
  );
  createdCalendarIds.push(calendar.id);

  const branch = await branchService.createBranch(
    { name: `Holiday Calendar Test Branch ${RUN_ID}`, holidayCalendarId: calendar.id },
    actor,
  );
  createdBranchIds.push(branch.id);

  const updated = await holidayCalendarService.updateHolidayCalendar(
    calendar.id,
    { status: 'INACTIVE' },
    actor,
  );
  assert.equal(updated.status, 'INACTIVE');

  await assert.rejects(
    () => holidayCalendarService.assertHolidayCalendarAssignable(calendar.id),
    { message: 'holidayCalendarId: this holiday calendar is not active and cannot be assigned' },
  );

  const stillLinked = await prisma.branch.findUnique({ where: { id: branch.id } });
  assert.equal(stillLinked.holidayCalendarId, calendar.id);
});

test('assertHolidayCalendarAssignable rejects a nonexistent holidayCalendarId', async () => {
  await assert.rejects(
    () =>
      holidayCalendarService.assertHolidayCalendarAssignable(
        '00000000-0000-0000-0000-000000000000',
      ),
    { message: 'holidayCalendarId: references a record that does not exist' },
  );
});

test('deleting a holiday calendar with zero Branch references succeeds; deleting a referenced one is rejected', async () => {
  const unreferenced = await holidayCalendarService.createHolidayCalendar(
    { name: `Unreferenced Calendar ${RUN_ID}` },
    actor,
  );
  await holidayCalendarService.deleteHolidayCalendar(unreferenced.id, actor);

  const referenced = await holidayCalendarService.createHolidayCalendar(
    { name: `Referenced Calendar ${RUN_ID}` },
    actor,
  );
  createdCalendarIds.push(referenced.id);

  const branch = await branchService.createBranch(
    { name: `Referenced Calendar Test Branch ${RUN_ID}`, holidayCalendarId: referenced.id },
    actor,
  );
  createdBranchIds.push(branch.id);

  await assert.rejects(() => holidayCalendarService.deleteHolidayCalendar(referenced.id, actor), {
    message:
      'This holiday calendar has Branch records referencing it and cannot be deleted - deactivate it instead',
  });
});
