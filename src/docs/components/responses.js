import { z } from 'zod';

// The single real error shape this API ever produces, regardless of status
// code (see src/middlewares/error.middleware.js) - even Zod validation
// failures collapse into this same one flat "message" string, never a
// field-level array (see src/middlewares/validate.middleware.js). One
// component, referenced everywhere, so this can't drift into a fictional
// "standard" shape that doesn't match what the server actually returns.
export const ErrorResponseSchema = z
  .object({
    status: z.literal('error').meta({ example: 'error' }),
    message: z.string().meta({ example: 'Invalid credentials' }),
  })
  .meta({
    id: 'ErrorResponse',
    description: 'The single error shape returned by every failing request',
  });

// Builds the repeated {description, content: {...}} response-object shape
// so every registerPath call writes errorResponse('...') instead of
// re-typing the same content.application/json.schema boilerplate.
export const errorResponse = (description, example) => ({
  description,
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
      ...(example && { example }),
    },
  },
});

export const jsonResponse = (description, schema, example) => ({
  description,
  content: {
    'application/json': {
      schema,
      ...(example && { example }),
    },
  },
});
