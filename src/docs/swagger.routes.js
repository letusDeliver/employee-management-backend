import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import openApiDocument from './openapi.document.js';

// Only ever mounted by app.js when env.ENABLE_SWAGGER is true - when it
// isn't, these routes don't exist at all, and hitting them falls through
// to the app's normal notFoundMiddleware like any other unmapped route.
const router = Router();

router.get('/api-docs.json', (req, res) => {
  res.status(200).json(openApiDocument);
});

router.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

export default router;
