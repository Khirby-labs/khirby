# 0049 — Ask Khirby reasoning with tools uses the Responses API

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** Patryk
- **Pokelo ADR id:** `a5fb2e67-eae3-4b62-adc7-3178bf44520e` (Khirby / Bearly CRM project)

## Context

Ask Khirby always sends function tools. AI Compose settings can set
`reasoning_effort` to `low` / `medium` / `high` for models that reason
(gpt-5.6-sol and similar). Those models accept reasoning on
`POST /v1/responses`, but reject the same combo on
`POST /v1/chat/completions` (`Function tools with reasoning_effort are not
supported … use /v1/responses or set reasoning_effort to none`).

Forcing `none` on chat/completions makes the request succeed and silently
turns reasoning off. The model still reasons — on the other endpoint.

## Decision

When the turn has function tools and a non-none `reasoning_effort`, Ask Khirby
calls `POST {baseUrl}/responses` using the **OpenAI Responses API** create
schema (`instructions`, typed `input` Items, `reasoning.effort`, internally
tagged function tools). Chat-only turns (no tools, including the synthesis pass)
stay on `/chat/completions`. If `/responses` is missing (404/405), we fall
back to chat/completions; `none` is a last resort after that fallback 400s —
not the first attempt.

## Consequences

**Easier:** operators can keep reasoning on while Ask Khirby uses tools.

**Harder:** the agent LLM client must map chat messages ↔ OpenAI Responses
Items (`instructions`, `message`, `function_call`, `function_call_output`)
and parse Responses SSE / `output` into the existing `StreamChunk` shape.
Request bodies follow the OpenAI Responses create schema (`reasoning.effort`,
internally tagged tools with `strict: false`, `store: false` so we manage
transcript ourselves) so OpenAI-compatible providers can implement the same
endpoint. Do not "fix" a tools + reasoning 400 by setting
`reasoning_effort: none` on `/chat/completions`.

Amends the LLM transport in ADR-0040; AI Compose BYOK is unchanged.

## Considered alternatives

- **Force `reasoning_effort: none` whenever tools are present** — rejected;
  the model supports reasoning on `/responses`.
- **Drop the field (omit effort)** — rejected; several providers default to
  non-none effort, so the 400 returns.
