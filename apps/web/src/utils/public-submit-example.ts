import type { FormField } from '@khirby/types';

function placeholderForField(field: FormField): unknown {
  switch (field.type) {
    case 'email':
      return 'visitor@example.com';
    case 'number':
      return 0;
    case 'url':
      return 'https://example.com';
    case 'tel':
      return '+48111222333';
    case 'textarea':
      return 'Example multi-line message.';
    case 'checkbox':
      return true;
    default:
      return 'Example';
  }
}

export function buildExampleSubmitData(
  fields: FormField[] | null | undefined,
): Record<string, unknown> {
  if (!fields?.length) {
    return {
      email: 'visitor@example.com',
      message: 'Example message from your site',
    };
  }

  const data: Record<string, unknown> = {};
  for (const field of fields) {
    data[field.name] = placeholderForField(field);
  }
  return data;
}

export function formatSubmitBodyJson(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2);
}

function escapeSingleQuotedShell(value: string): string {
  return value.split("'").join("'\\''");
}

export function buildPublicSubmitUrl(origin: string, endpointToken: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/api/public/forms/${endpointToken}/submit`;
}

export function buildCurlExample(submitUrl: string, data: Record<string, unknown>): string {
  const json = formatSubmitBodyJson(data);
  const escaped = escapeSingleQuotedShell(json);
  return `curl -X POST '${submitUrl}' \\
  -H 'Content-Type: application/json' \\
  -d '${escaped}'`;
}

export function buildPublicSchemaUrl(origin: string, endpointToken: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/api/public/forms/${endpointToken}`;
}

export function buildSdkInstallHint(): string {
  return 'pnpm add @khirby/forms-client';
}

export function buildSdkExample(
  baseUrl: string,
  endpointToken: string,
  fields: FormField[] | null | undefined,
): string {
  const data = buildExampleSubmitData(fields);
  const dataLines = formatSubmitBodyJson(data)
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');

  return `import { createClient } from '@khirby/forms-client';

const crm = createClient({ baseUrl: '${baseUrl.replace(/\/$/, '')}' });

// Optional: fetch required fields from CRM
const form = await crm.getForm('${endpointToken}');
// form.fields → ${JSON.stringify((fields ?? []).map((f) => f.name))}

await crm.submit('${endpointToken}', ${dataLines});`;
}

/** Inquiry adaptive: plan (no DB) → one-shot submit with opening + Q/A + contact. */
export function buildInquirySdkExample(baseUrl: string, endpointToken: string): string {
  const base = baseUrl.replace(/\/$/, '');
  return `import { createClient } from '@khirby/forms-client';

const crm = createClient({ baseUrl: '${base}', locale: 'pl' });

const form = await crm.getForm('${endpointToken}', { locale: 'pl' });
// form.openingLabel → first field label

// 1) Plan follow-ups — ephemeral, no Inquiry row
const { questions } = await crm.planAdaptive('${endpointToken}', {
  opening: 'Mamy hurtownię — handlowcy gubią wątki w WhatsAppie.',
  locale: 'pl',
});
// questions → show all fields at once (form, not chat)

// 2) One DB write: opening + planned Q→A + contact → ready_for_review
await crm.submitAdaptive('${endpointToken}', {
  opening: 'Mamy hurtownię — handlowcy gubią wątki w WhatsAppie.',
  questions,
  answers: [
    'Około 25 osób, sprzedaż + logistyka.',
    'Chcemy jedną skrzynkę i historię przy kliencie.',
    'Decyzja w ciągu miesiąca, integracja z magazynem.',
  ],
  name: 'Ada',
  email: 'ada@example.com',
  company: 'Acme',
  locale: 'pl',
});`;
}

export function buildInquiryCurlExample(origin: string, endpointToken: string): string {
  const base = origin.replace(/\/$/, '');
  const planUrl = `${base}/api/public/forms/${endpointToken}/adaptive/plan`;
  const submitUrl = `${base}/api/public/forms/${endpointToken}/inquiries`;
  return `# 1) Plan follow-ups (no DB write)
curl -X POST '${planUrl}' \\
  -H 'Content-Type: application/json' \\
  -d '{"opening":"We need help choosing a CRM.","locale":"en","_hp":""}'

# 2) One-shot persist: opening + questions + answers + contact
curl -X POST '${submitUrl}' \\
  -H 'Content-Type: application/json' \\
  -d '{"opening":"We need help choosing a CRM.","questions":["Team size?","Timeline?","Tools?"],"answers":["About 20 people","This quarter","Sheets"],"name":"Ada","email":"ada@example.com","company":"Acme","locale":"en","_hp":""}'`;
}

export function buildInquiryExampleJson(): string {
  return formatSubmitBodyJson({
    message: 'We need help choosing a CRM.',
  });
}

export function buildPublicInquiryUrl(origin: string, endpointToken: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/api/public/forms/${endpointToken}/inquiries`;
}

export function buildCodegenExample(baseUrl: string, endpointToken: string): string {
  return `pnpm exec khirby-forms-codegen \\
  --base-url ${baseUrl.replace(/\/$/, '')} \\
  --form ${endpointToken} \\
  --out ./src/generated/form.ts`;
}
