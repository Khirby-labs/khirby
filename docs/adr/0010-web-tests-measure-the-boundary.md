# 0010 — Web tests measure the boundary, not our own code

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** Damian Orzeł, Claude (pairing)

## Context

An audit of `apps/web` tests found good tests in a narrow band and a vacuum
around them. The dominant store/component pattern was `vi.mock('../api/client')`
plus `expect(apiX).toHaveBeenCalledWith(...)` — assertions that mirror the
implementation line for line. They are green by construction: the expectation
and the code share one author and one moment, and no independent layer of
reality sits between them. Meanwhile the layers where real bugs live —
URL/body serialization, error mapping, the 401 path, optimistic rollback,
SSE reconciliation, the router guard, and what the user actually sees in the
DOM — were untested. The 2026-07-24 confirm-dialog incident (every delete a
silent no-op) proved the point: only a test that mounted real Reka UI and drove
the real DOM could have caught it, and that was the one test of its kind.

Without a written methodology, each new test imitated its neighbours, so the
pipeline reproduced the tautology on every task.

## Decision

A web test asserts **observable behavior at a system boundary**: what the user
sees (real DOM), or what the backend sees (an HTTP request on the wire). Stores,
composables, and the api client are implementation detail. We mock only real
boundaries — the network via **MSW**, and browser APIs (`EventSource`,
`matchMedia`, timers) — and never `vi.mock('../api/client')` in store/component
specs. Pure functions get plain input→output units with no mocks.

## Consequences

- **Easier:** requests flow through the real client (URL, serialization, error
  mapping, 204/401 handling) into MSW handlers, so a regression there turns a
  test red. Component specs mount the real thing and assert what the user
  observes. This is what surfaced — and let us fix — the pipeline store
  swallowing server error messages.
- **Harder / cost accepted:** specs are heavier than a one-line call assertion
  (MSW handlers, real mounts, `flushPromises`/`vi.waitFor`), and MSW is a new
  dependency with global setup (`src/test/setup.ts`, `onUnhandledRequest: 'error'`).
- **Rule agents must not "fix":** do **not** reintroduce `vi.mock('../api/client')`
  to make a store/component spec simpler — that reopens the exact tautology this
  ADR closes. **Do** add an MSW handler and assert the request/response and the
  resulting state or DOM. The reference pattern is `stores/roles.store.spec.ts`
  (network) and `composables/useConfirm.spec.ts` (DOM). Codified in
  `.claude/rules/web.md` → "Methodology" and enforced for gap-filling in
  `.claude/agents/test-writer.md`.

## Considered alternatives

- **Keep mocking the api client and assert calls.** Rejected: green by
  construction, blind to integration bugs, and it drifts silently from the API.
- **Full E2E for everything.** Rejected as the primary layer: too slow and
  flaky to be the workhorse. E2E is kept as a thin production-path smoke
  (`e2e/`, Playwright); the boundary-level integration tests carry the bulk.
