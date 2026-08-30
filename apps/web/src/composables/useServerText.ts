import { useI18n } from 'vue-i18n';
import type {
  Plugin,
  PluginConfigField,
  PluginConfigOption,
  PluginConfigPlaceholder,
  PluginFrontendRoute,
  Role,
} from '@khirby/types';
import { resolveServerText, seedRoleDescriptionKey, seedStageNameKey } from '../i18n/server-text';

/**
 * Renders backend-supplied text in the reader's language (ADR-0011).
 *
 * Each getter takes the object the API returned and gives back a display string:
 * the message key it carries — or the key its seeded identity maps to — resolved
 * if this bundle knows it, and the server's English literal otherwise.
 *
 * Call the getters from a `computed` or straight from the template, never from a
 * module-level const: the resolution reads the active locale, so a value captured
 * at import time would freeze at the boot language (`.claude/rules/i18n.md`).
 */
export function useServerText() {
  const { t, te } = useI18n();

  const resolve = (key: string | null | undefined, fallback: string): string =>
    resolveServerText(key, fallback, t, (k) => te(k));

  return {
    /*
     * Structural, not `Plugin`: a Marketplace card carries the same
     * literal-plus-key pair without being a stored row (it has no id or config
     * when the plugin is merely available). Narrowing to the fields actually read
     * lets both surfaces share one resolver instead of duplicating the fallback.
     */

    /** Plugin card title. */
    pluginDisplayName: (plugin: Pick<Plugin, 'displayName' | 'displayNameKey'>): string =>
      resolve(plugin.displayNameKey, plugin.displayName),

    /** Plugin card body. Empty string when the plugin ships no description. */
    pluginDescription: (plugin: Pick<Plugin, 'description' | 'descriptionKey'>): string =>
      plugin.description ? resolve(plugin.descriptionKey, plugin.description) : '',

    /** Sidebar and command-palette label of a plugin's own route. */
    pluginNavLabel: (route: PluginFrontendRoute): string =>
      resolve(route.navLabelKey, route.navLabel),

    /** Label of one field in a plugin's configuration form. */
    fieldLabel: (field: PluginConfigField): string => resolve(field.labelKey, field.label),

    /** Helper text under that field. Empty string when the field has none. */
    fieldDescription: (field: PluginConfigField): string =>
      field.description ? resolve(field.descriptionKey, field.description) : '',

    /** One choice of a plugin's `select` field. */
    optionLabel: (option: PluginConfigOption): string => resolve(option.labelKey, option.label),

    /** Description of a `{{token}}` in a template-field legend. */
    placeholderLabel: (ph: PluginConfigPlaceholder): string => resolve(ph.labelKey, ph.label),

    /**
     * Display name of a pipeline stage. Seeded stages read as Polish on a Polish
     * screen; a stage the operator renamed always renders their own words.
     *
     * Read-only surfaces only — the rename input in PipelineStagesView must bind
     * the stored value, or saving would write a translation into the database.
     */
    stageName: (stage: { name: string }): string =>
      resolve(seedStageNameKey(stage.name), stage.name),

    /** Role description — localized only while it is still the seeded one. */
    roleDescription: (role: Pick<Role, 'name' | 'description'>): string =>
      role.description
        ? resolve(seedRoleDescriptionKey(role.name, role.description), role.description)
        : '',
  };
}
