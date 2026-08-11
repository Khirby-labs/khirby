export type KhirbyFormsPluginOptions = {
  /**
   * Collection slug for CRM form registry (default: `crm-forms`).
   */
  collectionSlug?: string;
  /**
   * Admin group label for the collection.
   */
  adminGroup?: string;
};

/** @deprecated Use {@link KhirbyFormsPluginOptions} */
export type BearlyCrmFormsPluginOptions = KhirbyFormsPluginOptions;
