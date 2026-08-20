/** Tracks instance-plugin directories that were mutated but not yet installed in this turn. */

export type PluginTraceEntry = {
  name: string;
  args?: Record<string, unknown>;
  ok: boolean;
  summary: string;
};

const MUTATING = new Set(['scaffold_plugin', 'write_instance_plugin_file']);
const INSTALL_TOOLS = new Set(['install_instance_plugin', 'scaffold_plugin']);

export function pluginDirectory(args: Record<string, unknown> | undefined): string | null {
  if (!args) return null;
  const dir = args.directory;
  return typeof dir === 'string' && dir.trim() ? dir.trim() : null;
}

export function pluginInstallSucceeded(
  name: string,
  result: { ok: boolean; summary: string },
): boolean {
  if (!result.ok) return false;
  if (name === 'install_instance_plugin') return true;
  if (name === 'scaffold_plugin') {
    return /installed/i.test(result.summary);
  }
  return false;
}

export function trackPluginDirectory(
  pending: Set<string>,
  installed: Set<string>,
  name: string,
  args: Record<string, unknown>,
  result: { ok: boolean; summary: string },
): void {
  const dir = pluginDirectory(args);
  if (!dir) return;

  if (name === 'remove_instance_plugin' && result.ok) {
    pending.delete(dir);
    installed.delete(dir);
    return;
  }

  if (pluginInstallSucceeded(name, result)) {
    pending.delete(dir);
    installed.add(dir);
    return;
  }

  if (MUTATING.has(name) && result.ok) {
    pending.add(dir);
    installed.delete(dir);
  }

  if (name === 'scaffold_plugin' && !result.ok) {
    pending.add(dir);
    installed.delete(dir);
  }
}

export function pendingPluginDirectories(pending: Set<string>, installed: Set<string>): string[] {
  return [...pending].filter((dir) => !installed.has(dir));
}

/** Fallback when the model stops without text — never claim success without install. */
export function pluginAwareFallbackSummary(trace: PluginTraceEntry[]): string | null {
  const touched = trace.filter((t) => INSTALL_TOOLS.has(t.name) || MUTATING.has(t.name));
  if (!touched.length) return null;

  if (trace.some((t) => pluginInstallSucceeded(t.name, t))) {
    const last = [...trace].reverse().find((t) => pluginInstallSucceeded(t.name, t));
    return last?.summary ?? null;
  }

  const failed = [...trace]
    .reverse()
    .find((t) => !t.ok && (MUTATING.has(t.name) || t.name === 'install_instance_plugin'));
  if (failed) {
    return `Plugin was not installed: ${failed.summary}`;
  }

  return 'Plugin was not installed — install_instance_plugin never succeeded.';
}
