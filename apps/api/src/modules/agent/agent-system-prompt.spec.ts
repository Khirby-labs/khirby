import { buildAgentSystemPrompt } from './agent-system-prompt';

describe('buildAgentSystemPrompt', () => {
  it('includes CRM workflow hints', () => {
    const prompt = buildAgentSystemPrompt({ hasPokelo: false, hasPluginTools: false });
    expect(prompt).toContain('search_leads');
    expect(prompt).toContain('list_pipeline_stages');
    expect(prompt).toContain('list_board_modules');
    expect(prompt).toContain('list_mail_threads');
    expect(prompt).not.toContain('search_knowledge_base');
    expect(prompt).not.toContain('list_marketplace_plugins');
  });

  it('includes Markdown formatting guidance', () => {
    const prompt = buildAgentSystemPrompt({ hasPokelo: false, hasPluginTools: false });
    expect(prompt).toContain('Markdown table');
    expect(prompt).toContain('Never paste raw tool output');
  });

  it('instructs autonomous tool use without asking permission', () => {
    const prompt = buildAgentSystemPrompt({ hasPokelo: false, hasPluginTools: false });
    expect(prompt).toContain('Tool autonomy');
    expect(prompt).toContain('do not ask whether you should');
    expect(prompt).toContain('call them, then answer');
    expect(prompt).toContain('answer immediately');
  });

  it('includes Pokelo guidance when configured', () => {
    const prompt = buildAgentSystemPrompt({ hasPokelo: true, hasPluginTools: false });
    expect(prompt).toContain('search_knowledge_base');
    expect(prompt).toContain('Use it eagerly');
  });

  it('includes Marketplace guidance when marketplace tools are exposed', () => {
    const prompt = buildAgentSystemPrompt({
      hasPokelo: false,
      hasPluginTools: false,
      hasMarketplaceTools: true,
    });
    expect(prompt).toContain('list_marketplace_plugins');
    expect(prompt).toContain('install_marketplace_plugin');
    expect(prompt).toContain('catalogNewer');
    expect(prompt).toContain('inCatalog');
    expect(prompt).toContain('NOT published');
    expect(prompt).toContain('NO update/upgrade tool');
    expect(prompt).toContain('/marketplace');
  });

  it('includes plugin authoring workflow when plugin tools are exposed', () => {
    const prompt = buildAgentSystemPrompt({ hasPokelo: false, hasPluginTools: true });
    expect(prompt).toContain('describe_plugin_contract');
    expect(prompt).toContain('InstancePluginView');
    expect(prompt).toContain('stats:');
    expect(prompt).toContain('https://khirby.com/docs/plugins/create');
    expect(prompt).toContain('https://khirby.com/docs/plugins/host');
    expect(prompt).toContain('https://khirby.com/docs/plugins/self-build');
    expect(prompt).toContain('loadVolumeNestModule');
    expect(prompt).toContain('list_installed_plugins once');
    expect(prompt).toContain('SPA page');
    expect(prompt).toContain('[tutaj]');
    expect(prompt).toContain('/plugins/');
    expect(prompt).toContain('never invent a URL');
    expect(prompt).toContain('without a full page reload');
  });

  it('includes both Pokelo and plugin sections when both available', () => {
    const prompt = buildAgentSystemPrompt({ hasPokelo: true, hasPluginTools: true });
    expect(prompt).toContain('Pokelo knowledge base');
    expect(prompt).toContain('Instance plugins');
  });
});
