// The deployment build emits this module and rewrites its relative imports to .js.
import { handleRequest } from '../.vercel-backend/server/handler.js'
export default { fetch: handleRequest }
