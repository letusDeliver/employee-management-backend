import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';

import registry from './openapi.registry.js';
import './components/security.js';
import './components/responses.js';
import './components/schemas.js';
import './system.docs.js';
import '../modules/auth/auth.docs.js';
import '../modules/users/user.docs.js';
import '../modules/employees/employee.docs.js';
import '../modules/employees/employeeDocument.docs.js';
import '../modules/branches/branch.docs.js';
import '../modules/departments/department.docs.js';
import '../modules/designations/designation.docs.js';
import '../modules/holidayCalendars/holidayCalendar.docs.js';
import '../modules/shifts/shift.docs.js';
import '../modules/attendance/attendance.docs.js';
import '../modules/leaveTypes/leaveType.docs.js';
import '../modules/leave/leave.docs.js';
import '../modules/payroll/payroll.docs.js';

// Import order matters: every *.docs.js file must finish calling
// registry.registerPath() (a side effect of import) before
// generateDocument() reads registry.definitions - see
// planning/feature-13-swagger-api-docs.md, "Folder Structure".
const generator = new OpenApiGeneratorV3(registry.definitions);

const openApiDocument = generator.generateDocument({
  openapi: '3.0.0',
  info: {
    title: 'Employee Management App API',
    version: '1.0.0',
    description:
      'Interactive reference for every endpoint. For security testing, negative testing, and edge cases, see handbook/API_ENDPOINTS.md in the repository.',
  },
  servers: [{ url: '/api/v1' }],
});

export default openApiDocument;
