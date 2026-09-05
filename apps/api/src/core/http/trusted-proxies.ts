/** Loopback covers bundled nginx; additional addresses are explicit deployment configuration. */
export function trustedProxies(configured = process.env.TRUSTED_PROXY_CIDRS ?? ''): string[] {
  return [
    'loopback',
    ...configured
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ];
}
