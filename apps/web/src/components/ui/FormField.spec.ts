import { describe, it, expect, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import FormField from './FormField.vue';
import { mountWithI18n, withLocale, resetLocale } from '../../test/i18n';

/**
 * Two properties worth locking down once labels are translated:
 * the required marker has to be announced, and the generated DOM id must NOT be
 * derived from the label text — otherwise every id changes with the language and
 * any selector keyed on it breaks in the second locale only.
 */
const Host = defineComponent({
  props: { label: { type: String, required: true }, required: Boolean },
  setup(props) {
    return () =>
      h(
        FormField,
        { label: props.label, required: props.required },
        {
          default: ({ fieldId }: { fieldId: string }) => h('input', { id: fieldId }),
        },
      );
  },
});

describe('FormField', () => {
  afterEach(resetLocale);

  it('announces the required marker instead of showing a bare asterisk', () => {
    const wrapper = mountWithI18n(Host, { props: { label: 'New password', required: true } });

    expect(wrapper.find('[aria-hidden="true"]').text()).toBe('*');
    expect(wrapper.find('.sr-only').text()).toBe('Required');
  });

  it('omits the marker when the field is optional', () => {
    const wrapper = mountWithI18n(Host, { props: { label: 'Nickname' } });
    expect(wrapper.find('.sr-only').exists()).toBe(false);
  });

  it('gives the label and the control the same id', () => {
    const wrapper = mountWithI18n(Host, { props: { label: 'New password' } });
    const id = wrapper.find('input').attributes('id');

    expect(id).toBeTruthy();
    expect(wrapper.find('label').attributes('for')).toBe(id);
  });

  it('does not derive the id from the label text', async () => {
    const english = mountWithI18n(Host, { props: { label: 'New password' } });
    const englishId = english.find('input').attributes('id')!;

    await withLocale('pl');
    const polish = mountWithI18n(Host, { props: { label: 'Nowe hasło' } });
    const polishId = polish.find('input').attributes('id')!;

    // Ids used to be a slug of the label, so they changed with the language and
    // 'Nowe hasło' would have slugged to 'f-nowe-has-o'.
    expect(englishId).not.toContain('password');
    expect(polishId).not.toContain('has');
    expect(polishId).toMatch(/^[\w-]+$/);
  });
});
