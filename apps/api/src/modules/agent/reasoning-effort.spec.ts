import {
  applyReasoningEffort,
  isReasoningEffort,
  parseModelReasoningSupport,
} from '../../../../../packages/plugin-host/src/reasoning-effort';

describe('parseModelReasoningSupport', () => {
  it('reads OpenRouter-style supported_parameters', () => {
    expect(
      parseModelReasoningSupport({
        id: 'openai/gpt-5',
        supported_parameters: ['max_tokens', 'reasoning_effort'],
      }),
    ).toBe(true);
    expect(
      parseModelReasoningSupport({
        id: 'openai/gpt-4o',
        supported_parameters: ['temperature', 'max_tokens'],
      }),
    ).toBe(false);
  });

  it('reads supported_params, include_reasoning, and capabilities', () => {
    expect(parseModelReasoningSupport({ supported_params: ['include_reasoning'] })).toBe(true);
    expect(parseModelReasoningSupport({ capabilities: { reasoning: true } })).toBe(true);
    expect(parseModelReasoningSupport({ supports_reasoning: false })).toBe(false);
  });

  it('returns undefined when the catalog is silent (OpenAI /v1/models)', () => {
    expect(parseModelReasoningSupport({ id: 'gpt-5-mini', object: 'model' })).toBeUndefined();
    expect(
      parseModelReasoningSupport({ id: 'gpt-4o', object: 'model', created: 1 }),
    ).toBeUndefined();
  });
});

describe('applyReasoningEffort', () => {
  it('accepts none/low/medium/high only', () => {
    expect(isReasoningEffort('high')).toBe(true);
    expect(isReasoningEffort('xhigh')).toBe(false);
    expect(isReasoningEffort(null)).toBe(false);
  });

  it('attaches reasoning_effort when the catalog advertises support', () => {
    expect(
      applyReasoningEffort({ model: 'any-reasoner', temperature: 0.7, stream: true }, 'high', true),
    ).toEqual({ model: 'any-reasoner', reasoning_effort: 'high', stream: true });
  });

  it('never attaches when the catalog said the model does not support it', () => {
    const body = { model: 'chat-only', temperature: 0.7 };
    expect(applyReasoningEffort(body, 'high', false)).toEqual(body);
  });

  it('attaches when the catalog is silent so the caller can try and drop on 400', () => {
    expect(applyReasoningEffort({ model: 'unknown', temperature: 0.7 }, 'medium')).toEqual({
      model: 'unknown',
      reasoning_effort: 'medium',
    });
  });

  it('drops temperature when the catalog confirmed reasoning even without an effort', () => {
    expect(applyReasoningEffort({ model: 'reasoner', temperature: 0.7 }, null, true)).toEqual({
      model: 'reasoner',
    });
  });
});
