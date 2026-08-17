import type { CrmEvent, PluginContext } from '@khirby/plugin-sdk';
import { createPlugin } from './index';

/**
 * The fixture is the only thing a fresh V1 instance can actually install, so its
 * event handler is the thing the whole Marketplace ladder is demonstrated with —
 * install from the UI, create a contact, see the line in the log. This spec pins
 * that behaviour so the demonstration cannot quietly stop working.
 *
 * It also proves the Jest `roots` change: before `examples/` was added, this file
 * did not run at all.
 */

function makeContext(): PluginContext & { log: jest.Mock } {
  return { log: jest.fn(), config: {} };
}

describe('crm-plugin-hello', () => {
  it('declares the identity the registry seeds and the SPA localizes', () => {
    const plugin = createPlugin();
    expect(plugin.name).toBe('crm_hello');
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+/);
    // Literal AND key — the card must be readable in both languages, and still
    // readable to an SPA that does not know the key.
    expect(plugin.displayName.length).toBeGreaterThan(0);
    expect(plugin.displayNameKey).toBe('plugins.hello.displayName');
    expect(plugin.descriptionKey).toBe('plugins.hello.description');
  });

  it('keeps its route out of the sidebar, so no English literal reaches the chrome', () => {
    const routes = createPlugin().getFrontendRoutes?.() ?? [];
    expect(routes).toHaveLength(1);
    expect(routes[0].showInNav).toBe(false);
  });

  it('logs on contact.created', async () => {
    const plugin = createPlugin();
    const ctx = makeContext();
    const event: CrmEvent = {
      type: 'contact.created',
      payload: { id: 'c1', email: 'ada@example.com', createdAt: new Date() },
    };

    await plugin.onEvent?.(event, ctx);

    expect(ctx.log).toHaveBeenCalledTimes(1);
    expect(ctx.log.mock.calls[0].join(' ')).toContain('ada@example.com');
  });

  it('ignores an event type it does not handle', async () => {
    const plugin = createPlugin();
    const ctx = makeContext();
    const event: CrmEvent = {
      type: 'form.submitted',
      payload: {
        submissionId: 's1',
        formId: 'f1',
        formSlug: 'contact',
        formName: 'Contact',
        contactId: 'c1',
        contactEmail: 'ada@example.com',
        data: {},
        createdAt: new Date(),
      },
    };

    await plugin.onEvent?.(event, ctx);

    expect(ctx.log).not.toHaveBeenCalled();
  });

  it('announces itself once on init', async () => {
    const ctx = makeContext();
    await createPlugin().onInit?.(ctx);
    expect(ctx.log).toHaveBeenCalledTimes(1);
  });
});
