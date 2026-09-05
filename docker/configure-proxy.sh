#!/bin/sh
set -eu
# Only IPs/CIDRs can enter nginx syntax. nginx validates address/range semantics.
case "${TRUSTED_PROXY_CIDRS:-}" in
  *[!0-9a-fA-F:.,/\ ]*) echo "TRUSTED_PROXY_CIDRS must contain comma-separated IPs/CIDRs" >&2; exit 1 ;;
esac
: > /etc/nginx/trusted-proxies.conf
for cidr in $(printf '%s' "${TRUSTED_PROXY_CIDRS:-}" | tr ',' ' '); do
  printf '%s 1;\n' "$cidr" >> /etc/nginx/trusted-proxies.conf
done
