import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import {
  HolidayCalendarSchema,
  HolidaySchema,
  PaginationMetaSchema,
} from '../../docs/components/schemas.js';
import {
  createHolidayCalendarSchema,
  updateHolidayCalendarSchema,
  listHolidayCalendarsQuerySchema,
  createHolidaySchema,
  updateHolidaySchema,
} from './holidayCalendar.validation.js';

const TAG = ['Holiday Calendars'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'f1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
});
const holidayIdParams = z.object({
  id: z.uuid().meta({ example: 'f1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
  holidayId: z.uuid().meta({ example: 'a9b8c7d6-e5f4-4a3b-8c1d-0e9f8a7b6c5d' }),
});

registry.registerPath({
  method: 'post',
  path: '/holiday-calendars',
  tags: TAG,
  summary: 'Create a Holiday Calendar',
  description: "Requires the 'holidayCalendar:create' permission. A named, reusable, year-agnostic container - not a per-year object.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createHolidayCalendarSchema } } } },
  responses: {
    201: jsonResponse('Holiday calendar created', z.object({ holidayCalendar: HolidayCalendarSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'holidayCalendar:create' permission"),
    409: errorResponse('A holiday calendar with this name already exists', {
      status: 'error',
      message: 'A holiday calendar with this name already exists',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/holiday-calendars',
  tags: TAG,
  summary: 'List Holiday Calendar records',
  description:
    "Requires the 'holidayCalendar:read' permission (granted to every role). Paginated, searchable (name, case-insensitive), filterable by status, sortable.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listHolidayCalendarsQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({
        holidayCalendars: z.array(HolidayCalendarSchema),
        pagination: PaginationMetaSchema,
      }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'holidayCalendar:read' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/holiday-calendars/{id}',
  tags: TAG,
  summary: 'Get one Holiday Calendar record',
  description: "Requires the 'holidayCalendar:read' permission. Does not include Holiday entries - see GET /holiday-calendars/{id}/holidays.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ holidayCalendar: HolidayCalendarSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'holidayCalendar:read' permission"),
    404: errorResponse('No Holiday Calendar with this id', {
      status: 'error',
      message: 'Holiday calendar not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/holiday-calendars/{id}',
  tags: TAG,
  summary: 'Update a Holiday Calendar, including activating/deactivating it',
  description:
    "Requires the 'holidayCalendar:update' permission. Deactivating a calendar never modifies existing Branch.holidayCalendarId references or deletes Holiday entries - it only blocks future assignment to new Branches.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateHolidayCalendarSchema } } },
  },
  responses: {
    200: jsonResponse('Holiday calendar updated', z.object({ holidayCalendar: HolidayCalendarSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'holidayCalendar:update' permission"),
    404: errorResponse('No Holiday Calendar with this id', {
      status: 'error',
      message: 'Holiday calendar not found',
    }),
    409: errorResponse('A holiday calendar with this name already exists', {
      status: 'error',
      message: 'A holiday calendar with this name already exists',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/holiday-calendars/{id}',
  tags: TAG,
  summary: 'Hard-delete a Holiday Calendar',
  description:
    "Requires the 'holidayCalendar:delete' permission. Only permitted when zero Branch records reference this calendar - deactivate it instead otherwise. Holiday entries cascade-delete automatically at the database level.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse(
      'Holiday calendar deleted',
      z.object({ message: z.string().meta({ example: 'Holiday calendar deleted successfully' }) }),
    ),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'holidayCalendar:delete' permission"),
    404: errorResponse('No Holiday Calendar with this id', {
      status: 'error',
      message: 'Holiday calendar not found',
    }),
    409: errorResponse(
      'This holiday calendar has Branch records referencing it and cannot be deleted',
      {
        status: 'error',
        message:
          'This holiday calendar has Branch records referencing it and cannot be deleted - deactivate it instead',
      },
    ),
  },
});

registry.registerPath({
  method: 'post',
  path: '/holiday-calendars/{id}/holidays',
  tags: TAG,
  summary: 'Add a Holiday entry to a calendar',
  description:
    "Requires the 'holidayCalendar:update' permission. The date must be unique within this calendar - a duplicate date returns 409.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: createHolidaySchema } } },
  },
  responses: {
    201: jsonResponse('Holiday added', z.object({ holiday: HolidaySchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'holidayCalendar:update' permission"),
    404: errorResponse('No Holiday Calendar with this id', {
      status: 'error',
      message: 'Holiday calendar not found',
    }),
    409: errorResponse('A holiday already exists on this date in this calendar', {
      status: 'error',
      message: 'A holiday already exists on this date in this calendar',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/holiday-calendars/{id}/holidays',
  tags: TAG,
  summary: "List a Holiday Calendar's Holiday entries",
  description: "Requires the 'holidayCalendar:read' permission. Ordered by date ascending.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ holidays: z.array(HolidaySchema) })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'holidayCalendar:read' permission"),
    404: errorResponse('No Holiday Calendar with this id', {
      status: 'error',
      message: 'Holiday calendar not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/holiday-calendars/{id}/holidays/{holidayId}',
  tags: TAG,
  summary: 'Update a Holiday entry',
  description: "Requires the 'holidayCalendar:update' permission.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: holidayIdParams,
    body: { content: { 'application/json': { schema: updateHolidaySchema } } },
  },
  responses: {
    200: jsonResponse('Holiday updated', z.object({ holiday: HolidaySchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'holidayCalendar:update' permission"),
    404: errorResponse(
      "No Holiday Calendar with this id ('Holiday calendar not found'), or the calendar exists but has no Holiday with this holidayId ('Holiday not found')",
      { status: 'error', message: 'Holiday not found' },
    ),
    409: errorResponse('A holiday already exists on this date in this calendar', {
      status: 'error',
      message: 'A holiday already exists on this date in this calendar',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/holiday-calendars/{id}/holidays/{holidayId}',
  tags: TAG,
  summary: 'Remove a Holiday entry',
  description:
    "Requires the 'holidayCalendar:update' permission. No reference restriction - Holiday entries can be freely removed, unlike the calendar itself.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: holidayIdParams },
  responses: {
    200: jsonResponse(
      'Holiday deleted',
      z.object({ message: z.string().meta({ example: 'Holiday deleted successfully' }) }),
    ),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'holidayCalendar:update' permission"),
    404: errorResponse(
      "No Holiday Calendar with this id ('Holiday calendar not found'), or the calendar exists but has no Holiday with this holidayId ('Holiday not found')",
      { status: 'error', message: 'Holiday not found' },
    ),
  },
});
