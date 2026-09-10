import { Test } from '@nestjs/testing';
import { resolveLoadedProvider } from './resolve-loaded-provider';

describe('resolveLoadedProvider', () => {
  it('returns a provider registered on the same testing module', async () => {
    const value = { ok: true };
    const moduleRef = await Test.createTestingModule({
      providers: [{ provide: 'TEST_TOKEN', useValue: value }],
    }).compile();

    expect(resolveLoadedProvider(moduleRef, 'TEST_TOKEN')).toBe(value);
  });

  it('returns null when the token is missing', async () => {
    const moduleRef = await Test.createTestingModule({ providers: [] }).compile();
    expect(resolveLoadedProvider(moduleRef, 'TEST_TOKEN')).toBeNull();
  });

  it('returns null when the token is explicitly bound to null', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [{ provide: 'TEST_TOKEN', useValue: null }],
    }).compile();
    expect(resolveLoadedProvider(moduleRef, 'TEST_TOKEN')).toBeNull();
  });

  it('prefers the last container module that provides the token', () => {
    const first = { id: 1 };
    const second = { id: 2 };
    const moduleRef = {
      get: () => first,
      container: {
        getModules: () =>
          new Map([
            [
              'old',
              {
                hasProvider: () => true,
                getProviderByKey: () => ({ instance: first }),
              },
            ],
            [
              'new',
              {
                hasProvider: () => true,
                getProviderByKey: () => ({ instance: second }),
              },
            ],
          ]),
      },
    };

    expect(resolveLoadedProvider(moduleRef as never, 'TEST_TOKEN')).toBe(second);
  });
});
