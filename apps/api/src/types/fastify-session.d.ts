import 'fastify';

declare module 'fastify' {
  interface Session {
    userId?: string;
    /**
     * Opaque row-scope id (ADR-0055). Set only by a SCOPE_PROVIDER plugin after
     * membership checks — core must not interpret it as a tenant product concept.
     */
    scopeId?: string;
  }
}
