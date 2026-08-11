import type { Config, Plugin } from 'payload';
import { createCrmFormsCollection } from './collection.js';
import type { KhirbyFormsPluginOptions } from './types.js';

export const khirbyForms =
  (options: KhirbyFormsPluginOptions = {}): Plugin =>
  (config: Config): Config => {
    const collectionSlug = options.collectionSlug ?? 'crm-forms';
    const collection = createCrmFormsCollection({
      slug: collectionSlug,
      adminGroup: options.adminGroup,
    });

    return {
      ...config,
      collections: [...(config.collections || []), collection],
    };
  };

/** @deprecated Use {@link khirbyForms} */
export const bearlyCrmForms = khirbyForms;
