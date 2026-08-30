import { AgentLlmClient } from './agent-llm.client';

describe('AgentLlmClient', () => {
  const client = new AgentLlmClient();

  it('collects tool_calls from delta chunks', () => {
    const chunks = client.collectFromChunks([
      { kind: 'tool_call', index: 0, id: 'call_1', name: 'search_contacts' },
      { kind: 'tool_call', index: 0, argumentsDelta: '{"query":' },
      { kind: 'tool_call', index: 0, argumentsDelta: '"x"}' },
      { kind: 'text', delta: 'Hello' },
    ]);
    expect(chunks.toolCalls).toEqual([
      { id: 'call_1', name: 'search_contacts', arguments: '{"query":"x"}' },
    ]);
    expect(chunks.text).toBe('Hello');
  });

  it('text-only stream yields text without tool calls', () => {
    const chunks = client.collectFromChunks([
      { kind: 'text', delta: 'Hi ' },
      { kind: 'text', delta: 'there' },
    ]);
    expect(chunks.text).toBe('Hi there');
    expect(chunks.toolCalls).toHaveLength(0);
  });
});
