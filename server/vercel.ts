// Serverless entry for Vercel. Bundled to api/index.js by `npm run build:api`.
import { createApp } from '../server.ts';

const app = createApp();
export default app;