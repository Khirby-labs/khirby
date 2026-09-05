import Fastify from 'fastify';
import { trustedProxies } from './trusted-proxies';

describe('explicit proxy trust with patched Fastify', () => {
  it.each([
    { peer: '203.0.113.4', forwarded: '127.0.0.1', expected: '203.0.113.4' },
    { peer: '127.0.0.1', forwarded: '198.51.100.4, 10.20.0.9', expected: '198.51.100.4' },
    {
      peer: '127.0.0.1',
      forwarded: '127.0.0.1, 198.51.100.4, 10.20.0.9',
      expected: '198.51.100.4',
    },
  ])(
    'resolves the client through only trusted peers: %j',
    async ({ peer, forwarded, expected }) => {
      const app = Fastify({ trustProxy: trustedProxies('10.20.0.9') });
      app.get('/', (req) => ({ ip: req.ip }));
      try {
        const response = await app.inject({
          method: 'GET',
          url: '/',
          remoteAddress: peer,
          headers: { 'x-forwarded-for': forwarded },
        });
        expect(response.json().ip).toBe(expected);
      } finally {
        await app.close();
      }
    },
  );
});
