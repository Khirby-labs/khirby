import { z } from 'zod';

// Mirrors @bearly/contracts (control-plane) for the subset Khirby calls.

export const ProductSlugSchema = z.enum(['khirby', 'pokelo', 'finsly']);
export type ProductSlug = z.infer<typeof ProductSlugSchema>;

export const PluginStatusSchema = z.enum([
  'draft',
  'submitted',
  'reviewing',
  'approved',
  'rejected',
  'deprecated',
  'blocked',
]);
export type PluginStatus = z.infer<typeof PluginStatusSchema>;

// ─── Telemetry ───────────────────────────────────────────────────────────────

export const HeartbeatPluginSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
});

export const HeartbeatUsersSchema = z.object({
  total: z.number().int().nonnegative(),
  active7d: z.number().int().nonnegative(),
  active30d: z.number().int().nonnegative(),
});

export const HeartbeatPayloadSchema = z.object({
  installationId: z.string().uuid(),
  product: ProductSlugSchema,
  version: z.string().min(1).max(64),
  sentAt: z.string().datetime().optional(),
  users: HeartbeatUsersSchema,
  usage: z.record(z.string(), z.unknown()).optional(),
  features: z.record(z.string(), z.boolean()).optional(),
  plugins: z.array(HeartbeatPluginSchema).max(200).optional(),
});

export const HeartbeatResponseSchema = z.object({
  ok: z.literal(true),
  instanceId: z.string().uuid(),
});

export type HeartbeatPayload = z.infer<typeof HeartbeatPayloadSchema>;
export type HeartbeatPlugin = z.infer<typeof HeartbeatPluginSchema>;
export type HeartbeatUsers = z.infer<typeof HeartbeatUsersSchema>;
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>;

// ─── Instance registration ───────────────────────────────────────────────────

export const RegisterInstanceSchema = z.object({
  installationId: z.string().uuid(),
  email: z.string().trim().email().max(320),
});

export const RegisterInstanceResponseSchema = z.object({
  ok: z.literal(true),
  installationId: z.string().uuid(),
  registeredEmail: z.string().email(),
  registeredAt: z.string().datetime(),
});

export type RegisterInstance = z.infer<typeof RegisterInstanceSchema>;
export type RegisterInstanceResponse = z.infer<typeof RegisterInstanceResponseSchema>;

// ─── Plugin submit ───────────────────────────────────────────────────────────

export const SubmitPluginSchema = z.object({
  installationId: z.string().uuid(),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(128),
  description: z.string().max(4000).optional(),
  packageName: z.string().min(1).max(214),
  publisherName: z.string().min(1).max(128).optional(),
  repositoryUrl: z.string().url().optional(),
});

export const SubmitPluginResponseSchema = z.object({
  slug: z.string(),
  name: z.string(),
  status: PluginStatusSchema,
  packageName: z.string(),
  submittedAt: z.string().datetime(),
});

export type SubmitPlugin = z.infer<typeof SubmitPluginSchema>;
export type SubmitPluginResponse = z.infer<typeof SubmitPluginResponseSchema>;

// ─── Marketplace (public) ────────────────────────────────────────────────────

export const MarketplacePluginSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  packageName: z.string(),
  publisherName: z.string(),
  verified: z.boolean(),
  repositoryUrl: z.string().nullable(),
  latestVersion: z.string().nullable(),
  permissions: z.array(z.string()).nullable(),
  compatible: z.boolean().optional(),
});

export const MarketplacePluginVersionSchema = z.object({
  version: z.string(),
  packageName: z.string(),
  checksum: z.string(),
  minimumProductVersion: z.string().nullable(),
  manifest: z.record(z.string(), z.unknown()).nullable(),
  permissions: z.array(z.string()).nullable(),
  publishedAt: z.string().datetime().nullable(),
  approvedAt: z.string().datetime().nullable(),
});

export type MarketplacePlugin = z.infer<typeof MarketplacePluginSchema>;
export type MarketplacePluginVersion = z.infer<typeof MarketplacePluginVersionSchema>;

export const ListMarketplacePluginsQuerySchema = z.object({
  search: z.string().optional(),
  verified: z.boolean().optional(),
  compatibleWith: z.string().optional(),
});

export type ListMarketplacePluginsQuery = z.infer<typeof ListMarketplacePluginsQuerySchema>;
