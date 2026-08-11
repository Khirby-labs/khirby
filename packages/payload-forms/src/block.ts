import type { Block } from 'payload'

export type CrmFormBlockOptions = {
  /**
   * Relationship collection slug (must match the plugin collection).
   * @default 'crm-forms'
   */
  formsCollectionSlug?: string
}

/**
 * Layout block for inserting a Khirby form into a page.
 * Add to your Pages (or Products) `blocks` array alongside CTA / Content / Media.
 */
export function createCrmFormBlock(options: CrmFormBlockOptions = {}): Block {
  const formsCollectionSlug = options.formsCollectionSlug ?? 'crm-forms'

  return {
    slug: 'crmForm',
    interfaceName: 'CrmFormBlock',
    labels: {
      singular: 'CRM Form',
      plural: 'CRM Forms',
    },
    fields: [
      {
        name: 'form',
        type: 'relationship',
        relationTo: formsCollectionSlug,
        required: true,
        admin: {
          description: 'Select a form from the CRM Forms collection (token comes from CRM).',
        },
      },
      {
        name: 'heading',
        type: 'text',
        admin: {
          description: 'Optional heading above the form.',
        },
      },
      {
        name: 'submitLabel',
        type: 'text',
        defaultValue: 'Submit',
      },
      {
        name: 'formNote',
        type: 'textarea',
        admin: {
          description: 'Short note shown near the form (e.g. privacy hint).',
        },
      },
      {
        name: 'successMessage',
        type: 'textarea',
        admin: {
          description: 'Message shown after a successful submission.',
        },
      },
    ],
  }
}

/** Default block bound to `crm-forms`. */
export const CrmFormBlock = createCrmFormBlock()
