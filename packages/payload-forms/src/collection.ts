import type { CollectionConfig } from 'payload'

export type CrmFormsCollectionOptions = {
  slug?: string
  adminGroup?: string
}

export function createCrmFormsCollection(
  options: CrmFormsCollectionOptions = {},
): CollectionConfig {
  const slug = options.slug ?? 'crm-forms'

  return {
    slug,
    labels: {
      singular: 'CRM Form',
      plural: 'CRM Forms',
    },
    admin: {
      useAsTitle: 'title',
      defaultColumns: ['title', 'token', 'active', 'updatedAt'],
      group: options.adminGroup ?? 'CRM',
      description:
        'Registry of Khirby public forms. Paste the endpoint token from CRM → Forms → Integration. Field schema always comes from CRM at runtime.',
    },
    access: {
      create: ({ req: { user } }) => Boolean(user),
      read: () => true,
      update: ({ req: { user } }) => Boolean(user),
      delete: ({ req: { user } }) => Boolean(user),
    },
    fields: [
      {
        name: 'title',
        type: 'text',
        required: true,
        admin: {
          description: 'Label shown in Payload admin (e.g. “Homepage contact”).',
        },
      },
      {
        name: 'token',
        type: 'text',
        required: true,
        admin: {
          description: 'Public endpoint token from Khirby form integration panel.',
        },
      },
      {
        name: 'active',
        type: 'checkbox',
        defaultValue: true,
        admin: {
          description: 'Inactive forms can still be referenced but frontends may hide them.',
        },
      },
    ],
  }
}
