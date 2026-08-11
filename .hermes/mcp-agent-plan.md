# CRM + Pokelo — Plan automatyzacji AI (MCP + Agent)

## Co Pokelo ma co jest wartościowe dla CRM

```
POST /v1/projects/:id/assist/messages   ← RAG Q&A z cytowaniami z dokumentów
GET  /v1/projects/:id/documents         ← lista dokumentów projektu
GET  /v1/projects/:id/documents/:docId  ← pełna treść dokumentu (contentMd)
GET  /v1/projects                       ← lista projektów (produkty, usługi)
```

Pokelo zna: ofertę produktową, ADR-y, runbooki, specyfikacje techniczne.
CRM zna: kto pyta, jakie dane podał w formularzu, historię kontaktu.

**Agent łączy oba** → gdy lead wypełni formularz, AI wie czego dotyczy zapytanie
i potrafi przygotować kontekstową odpowiedź bazując na wiedzy z Pokelo.

---

## Architektura — dwa tryby

### Tryb 1: MCP Server (Claude Desktop / human-in-the-loop)

```
Claude Desktop
  ├── MCP: pokelo-mcp  →  pokelo.bearly.pro API
  └── MCP: crm-mcp     →  CRM API
```

Użytkownik (np. handlowiec) pyta Clauda: *"Co wiemy o tym leadzie i jak odpowiedzieć?"*
Claude używa narzędzi CRM żeby pobrać dane leada i Pokelo żeby znaleźć odpowiedź w dokumentacji.

### Tryb 2: Automation Agent (server-side, bez człowieka)

```
CRM EventsService
  └── lead.created  →  AgentService (NestJS)
                          ├── GET /api/leads/:id        (dane leada)
                          ├── POST /v1/assist/messages  (query Pokelo)
                          └── POST /api/leads/:id/comments  (zapisz draft)
```

Nowy lead → automatycznie pojawia się komentarz z draftem odpowiedzi.
Handlowiec widzi draft, edytuje i wysyła. Zero ręcznej pracy.

---

## Część 1: MCP Server dla Pokelo

### Lokalizacja: `apps/pokelo-mcp/` w repo Pokelo

```
apps/pokelo-mcp/
  src/
    index.ts          ← entry point (stdio transport)
    tools/
      ask.ts          ← pokelo_ask
      search_docs.ts  ← pokelo_search_documents
      get_doc.ts      ← pokelo_get_document
      list_projects.ts← pokelo_list_projects
    auth.ts           ← JWT login + token cache
    client.ts         ← typed fetch wrapper
  package.json
  tsconfig.json
```

### Narzędzia MCP (tools)

| Tool | Opis | Pokelo endpoint |
|------|------|-----------------|
| `pokelo_ask` | Zadaj pytanie w kontekście projektu, zwróć odpowiedź + cytowania | `POST /v1/projects/:id/assist/messages` |
| `pokelo_list_projects` | Lista dostępnych projektów (produkty, usługi) | `GET /v1/projects` |
| `pokelo_search_documents` | Szukaj dokumentów w projekcie | `GET /v1/projects/:id/documents` |
| `pokelo_get_document` | Pobierz pełną treść dokumentu | `GET /v1/projects/:id/documents/:docId` |

### Auth

Pokelo używa JWT (`POST /v1/auth/login` → `accessToken`).
MCP server loguje się raz przy starcie, odświeża token przed wygaśnięciem.
Credentials z env: `POKELO_URL`, `POKELO_EMAIL`, `POKELO_PASSWORD`.

### `src/index.ts` (schema)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PoleloClient } from './client.js';

const client = new PoleloClient(process.env.POKELO_URL!);
await client.login(process.env.POKELO_EMAIL!, process.env.POKELO_PASSWORD!);

const server = new McpServer({ name: 'pokelo', version: '1.0.0' });

server.tool(
  'pokelo_ask',
  'Ask a question about a project using its documentation knowledge base. Returns answer with source citations.',
  {
    projectId: z.string().describe('Pokelo project ID'),
    question: z.string().describe('The question to ask'),
  },
  async ({ projectId, question }) => {
    const result = await client.assist(projectId, question);
    return {
      content: [{
        type: 'text',
        text: `**Answer:** ${result.answer}\n\n**Sources:**\n${
          result.citations.map(c => `- ${c.documentTitle}: "${c.snippet}"`).join('\n')
        }`,
      }],
    };
  },
);

server.tool(
  'pokelo_list_projects',
  'List all available Pokelo projects',
  {},
  async () => {
    const { items } = await client.listProjects();
    return {
      content: [{ type: 'text', text: JSON.stringify(items, null, 2) }],
    };
  },
);

// ... pokelo_search_documents, pokelo_get_document analogicznie

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Konfiguracja Claude Desktop

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "pokelo": {
      "command": "node",
      "args": ["/path/to/pokelo/apps/pokelo-mcp/dist/index.js"],
      "env": {
        "POKELO_URL": "https://pokelo.bearly.pro",
        "POKELO_EMAIL": "agent@bearly.pro",
        "POKELO_PASSWORD": "..."
      }
    },
    "crm": {
      "command": "node",
      "args": ["/path/to/crm/apps/crm-mcp/dist/index.js"],
      "env": {
        "CRM_URL": "https://crm.bearly.pro",
        "CRM_EMAIL": "agent@bearly.pro",
        "CRM_PASSWORD": "..."
      }
    }
  }
}
```

---

## Część 2: MCP Server dla CRM

### Lokalizacja: `apps/crm-mcp/` w repo CRM

### Narzędzia MCP

| Tool | Opis |
|------|------|
| `crm_list_leads` | Lista leadów z pipeline (opcjonalnie filtr stageId, ownerId) |
| `crm_get_lead` | Szczegóły leada: dane kontaktu, dane z formularza, komentarze, stage |
| `crm_add_comment` | Dodaj komentarz do leada |
| `crm_move_lead` | Przesuń leada do innego etapu |
| `crm_list_contacts` | Lista kontaktów |
| `crm_get_contact` | Szczegóły kontaktu + historia submisji |
| `crm_get_board` | Cały kanban board (wszystkie etapy + leady) |

Auth: CRM używa session cookie. MCP server loguje się przez `POST /api/auth/login`,
przechowuje cookie w pamięci, dodaje do każdego requestu.

---

## Część 3: Automation Agent w CRM (server-side)

To jest kluczowa część — automatyczny draft odpowiedzi bez człowieka.

### Nowy moduł: `apps/api/src/modules/agent/`

```
agent/
  agent.module.ts
  agent.service.ts       ← core: wywołuje Claude z narzędziami
  agent.tools.ts         ← definicje narzędzi (CRM + Pokelo calls)
  agent.prompts.ts       ← system prompt + task prompts
  dto/
    draft-response.dto.ts
```

### `agent.service.ts` — flow

```typescript
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class AgentService {
  private claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Wywołany z EventsService gdy lead.created
  async draftLeadResponse(leadId: string): Promise<void> {
    // 1. Pobierz dane leada z bazy (direct DB, bez HTTP)
    const lead = await this.leadsService.getDetail(leadId);

    // 2. Zbuduj kontekst
    const formData = JSON.stringify(lead.submissionData ?? {});
    const contactInfo = `${lead.contactName ?? lead.contactEmail}`;

    // 3. Wywołaj Claude z narzędziami Pokelo
    const response = await this.claude.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: AGENT_SYSTEM_PROMPT,
      tools: this.buildPokeloTools(),
      messages: [{
        role: 'user',
        content: `
Nowy lead w CRM. Przygotuj draft odpowiedzi dla handlowca.

Kontakt: ${contactInfo}
Dane z formularza: ${formData}
Formularz źródłowy: ${lead.formName ?? 'nieznany'}

Użyj pokelo_ask żeby znaleźć odpowiednie informacje o produktach/usługach.
Napisz krótki, profesjonalny draft odpowiedzi po polsku.
        `,
      }],
    });

    // 4. Obsłuż tool calls (agentic loop)
    const finalText = await this.runAgentLoop(response);

    // 5. Zapisz jako komentarz do leada
    if (finalText) {
      await this.leadsService.addComment(leadId, {
        body: `🤖 **AI Draft:**\n\n${finalText}`,
        userId: null, // system comment
      });
    }
  }

  private buildPokeloTools(): Anthropic.Tool[] {
    return [
      {
        name: 'pokelo_ask',
        description: 'Ask a question to Pokelo knowledge base. Use this to find product info, pricing, feature descriptions.',
        input_schema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Pokelo project ID' },
            question: { type: 'string', description: 'Question to ask' },
          },
          required: ['projectId', 'question'],
        },
      },
      {
        name: 'pokelo_list_projects',
        description: 'List available Pokelo projects to know which one to query',
        input_schema: { type: 'object', properties: {} },
      },
    ];
  }

  private async runAgentLoop(
    initialResponse: Anthropic.Message,
  ): Promise<string | null> {
    let response = initialResponse;
    const messages: Anthropic.MessageParam[] = [];

    // Max 5 turns żeby nie zapętlić
    for (let i = 0; i < 5; i++) {
      if (response.stop_reason === 'end_turn') {
        // Zwróć ostatni text block
        return response.content
          .filter(b => b.type === 'text')
          .map(b => (b as Anthropic.TextBlock).text)
          .join('\n');
      }

      if (response.stop_reason !== 'tool_use') break;

      // Wykonaj tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const result = await this.executeTool(block.name, block.input as Record<string, unknown>);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await this.claude.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: AGENT_SYSTEM_PROMPT,
        tools: this.buildPokeloTools(),
        messages,
      });
    }

    return null;
  }

  private async executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    switch (name) {
      case 'pokelo_list_projects': {
        const projects = await this.pokeloClient.listProjects();
        return JSON.stringify(projects.items.map(p => ({ id: p.id, name: p.name })));
      }
      case 'pokelo_ask': {
        const result = await this.pokeloClient.assist(
          input.projectId as string,
          input.question as string,
        );
        return `${result.answer}\n\nSources: ${result.citations.map(c => c.documentTitle).join(', ')}`;
      }
      default:
        return 'Tool not found';
    }
  }
}
```

### `agent.prompts.ts`

```typescript
export const AGENT_SYSTEM_PROMPT = `
Jesteś asystentem sprzedaży w firmie Bearly. Twoim zadaniem jest przygotowanie draftu odpowiedzi na zapytanie potencjalnego klienta.

Zasady:
- Użyj pokelo_list_projects żeby znaleźć właściwy projekt w bazie wiedzy
- Użyj pokelo_ask żeby uzyskać konkretne informacje o produktach/usługach
- Przygotuj krótki, profesjonalny draft (3-5 zdań) w języku polskim
- Zidentyfikuj główne pytanie/potrzebę klienta i odnieś się do niej bezpośrednio
- Nie wymyślaj faktów — opieraj się wyłącznie na informacjach z Pokelo
- Draft oznacza "do przejrzenia przez człowieka" — możesz zostawić [UZUPEŁNIJ] gdzie brakuje danych
`;
```

### Podłączenie do EventsService

```typescript
// events.service.ts — dodaj callback po emisji lead.created
// LUB w leads.service.ts po INSERT:

constructor(
  // ...
  private readonly agent: AgentService,
) {}

async createFromSubmission(...): Promise<Lead> {
  const lead = await this.db.insert(leads)...;

  // Fire and forget — nie blokuj odpowiedzi
  this.agent.draftLeadResponse(lead.id).catch(err =>
    this.logger.warn('Agent draft failed', err)
  );

  return lead;
}
```

### PokeloClient (wstrzykiwany w AgentModule)

```typescript
// pokelo.client.ts
@Injectable()
export class PokeloClient {
  private token: string | null = null;

  constructor(private config: ConfigService) {}

  async ensureAuth() {
    if (this.token) return;
    const res = await fetch(`${this.config.get('POKELO_URL')}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: this.config.get('POKELO_EMAIL'),
        password: this.config.get('POKELO_PASSWORD'),
      }),
    });
    const data = await res.json();
    this.token = data.accessToken;
  }

  async assist(projectId: string, message: string) {
    await this.ensureAuth();
    const res = await fetch(
      `${this.config.get('POKELO_URL')}/v1/projects/${projectId}/assist/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ message, stream: false }),
      },
    );
    return res.json();
  }

  async listProjects() {
    await this.ensureAuth();
    const res = await fetch(`${this.config.get('POKELO_URL')}/v1/projects`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    return res.json();
  }
}
```

---

## Zmienne środowiskowe do dodania w `.env`

```env
# AI Agent
ANTHROPIC_API_KEY=sk-ant-...

# Pokelo integration
POKELO_URL=https://pokelo.bearly.pro
POKELO_EMAIL=agent@bearly.pro
POKELO_PASSWORD=...
POKELO_DEFAULT_PROJECT_ID=  # opcjonalnie — żeby nie szukać projektu za każdym razem
```

---

## Kolejność wdrożenia

```
1. PokeloClient + AgentModule w CRM (bez wywoływania — tylko żeby przetestować połączenie)
2. AgentService.draftLeadResponse() — wywołaj manualnie dla istniejącego leada, sprawdź output
3. Podłączyć do leads.service.createFromSubmission() — fire and forget
4. MCP Server Pokelo (apps/pokelo-mcp) — dla handlowców używających Claude Desktop
5. MCP Server CRM (apps/crm-mcp) — opcjonalnie, dla bardziej zaawansowanych use cases
```

---

## Czego na razie nie robić (scope MVP)

- Automatyczne wysyłanie odpowiedzi — zawsze human review przez komentarz w leadzie
- Wiele projektów Pokelo do przeszukiwania naraz — zacznij od jednego domyślnego
- Fine-tuning promptów pod konkretne typy formularzy — to faza 2
- WebSocket/streaming w agencie — zbędne dla background job
- Osobny mikroserwis dla agenta — NestJS moduł w istniejącym API wystarczy

---

## Diagram przepływu

```
Formularz publiczny
  └── POST /api/public/forms/:token/submit
        ├── upsert contact
        ├── create submission
        ├── create lead (LeadsService)
        │     └── [fire & forget] AgentService.draftLeadResponse(leadId)
        │           ├── getLeadDetail(leadId)      ← DB direct
        │           ├── PokeloClient.listProjects()
        │           ├── PokeloClient.assist(projectId, question)
        │           └── LeadsService.addComment(leadId, "🤖 AI Draft: ...")
        └── SSE: lead.created → PipelineView odświeża board
              └── Handlowiec widzi nowego leada + komentarz z draftem
```
