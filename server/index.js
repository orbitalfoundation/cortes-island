import { createServer } from './server.js';

createServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
