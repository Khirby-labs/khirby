import {
  buildAgentSystemPrompt,
  replyLanguageRule,
  synthesisLanguageNudge,
} from './agent-system-prompt';

describe('buildAgentSystemPrompt', () => {
  it('includes CRM workflow hints', () => {
    const prompt = buildAgentSystemPrompt({ hasPokelo: false, hasPluginTools: false });
    expect(prompt).toContain('search_leads');
    expect(prompt).toContain('list_custom_fields');
    expect(prompt).toContain('update_contact');
    expect(prompt).toContain('import_contacts');
    expect(prompt).toContain('list_pipeline_stages');
    expect(prompt).toContain('list_board_modules');
    expect(prompt).toContain('list_mail_threads');
    expect(prompt).not.toContain('search_knowledge_base');
    expect(prompt).not.toContain('list_marketplace_plugins');
  });

  it('pins English replies to the UI locale, not tool output or prompt examples', () => {
    const prompt = buildAgentSystemPrompt({
      hasPokelo: false,
      hasPluginTools: true,
      locale: 'en',
    });
    expect(prompt).toContain('The CRM UI language is English');
    expect(prompt).toContain('They must not choose your reply language');
    expect(prompt).toContain('You have **2 leads** on the board');
    expect(prompt).toContain('[here](/plugins/hello-stats)');
    expect(prompt).not.toContain('Masz **2 leady**');
    expect(prompt).not.toMatch(/kliknij \[tutaj\]/);
  });

  it('pins Polish replies by instruction, without a Polish few-shot sample', () => {
    const prompt = buildAgentSystemPrompt({
      hasPokelo: false,
      hasPluginTools: true,
      locale: 'pl',
    });
    expect(prompt).toContain('The CRM UI language is Polish');
    expect(prompt).toContain('You have **2 leads** on the board');
    expect(prompt).toContain('[here](/plugins/hello-stats)');
    expect(prompt).not.toContain('Masz **2 leady**');
    expect(prompt).not.toMatch(/kliknij \[tutaj\]/);
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
    expect(prompt).toContain('[here]');
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

describe('reply language helpers', () => {
  it('tells synthesis to match the user message, not the conversation, when locale is unknown', () => {
    expect(synthesisLanguageNudge()).toContain("user's latest message");
    expect(synthesisLanguageNudge()).not.toContain('same language as the conversation');
    expect(replyLanguageRule()).toContain("user's latest message");
  });

  it('names the UI language in the synthesis nudge', () => {
    expect(synthesisLanguageNudge('en')).toContain('in English (the CRM UI language)');
    expect(synthesisLanguageNudge('pl')).toContain('in Polish (the CRM UI language)');
  });
});
