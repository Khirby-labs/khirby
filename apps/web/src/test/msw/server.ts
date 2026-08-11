import { setupServer } from 'msw/node';

// A bare server — every spec declares the handlers it needs via `server.use(...)`.
// This keeps fixtures next to the assertion that depends on them, instead of a
// shared global mock the tests silently rely on.
export const server = setupServer();
