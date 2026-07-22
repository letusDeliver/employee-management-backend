import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

// The one shared registry instance - every component (security schemes,
// reusable schemas) and every module's *.docs.js file registers against
// this same object, so generateDocument() (openapi.document.js) sees a
// complete picture regardless of which file registered what.
const registry = new OpenAPIRegistry();

export default registry;
