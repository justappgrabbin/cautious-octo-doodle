# Synthia Single Hub — Start Here

This patched bundle wires Messenger Discovery into the Synthia v4.3 server so the project can act as one hub for the user and multiple AI agents.

## What changed

- Added `src/api/v3/discovery.ts`
- Added `src/workers/discovery_engine.ts`
- Added `src/api/v3/UMSConnector.ts`
- Added `src/api/v3/CouncilInterface.ts`
- Added `src/workers/UMSConnector.ts`
- Patched `src/server.ts` to mount `/api/v3/discovery`
- Patched `package.json` to use installable `multer@1.4.5-lts.1`
- Added `db:push-discovery`
- Replaced `sql/discovery_protocol.sql` with a valid JSONB-safe schema

## Run locally

```bash
cd synthia-master-merged-v4.3
npm install
npm run build
PORT=3000 npm start
```

## Optional Supabase persistence

Set these before starting the server:

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
export SYNTHIA_GROUP_REF="synthia-hub"
```

Then push the discovery schema:

```bash
psql "$DATABASE_URL" -f sql/discovery_protocol.sql
```

## Smoke test

```bash
curl http://localhost:3000/api/v3/discovery/health

curl -X POST http://localhost:3000/api/v3/discovery/register \
  -H 'content-type: application/json' \
  -d '{"id":"chatgpt","owner":"alexis","domain":"reasoning","capabilities":["chat","code"],"convergence_interests":["memory","context"],"endpoint":"mcp://chatgpt","adapter_kind":"mcp"}'

curl -X POST http://localhost:3000/api/v3/discovery/message \
  -H 'content-type: application/json' \
  -d '{"from":"alexis","to":"chatgpt","text":"shared context test","intent_type":"context_sync"}'

curl http://localhost:3000/api/v3/discovery/messages/chatgpt
```

## Working endpoints

- `GET /api/v3/discovery/health`
- `POST /api/v3/discovery/register`
- `POST /api/v3/discovery/heartbeat/:agentId`
- `GET /api/v3/discovery/agents`
- `GET /api/v3/discovery/graph`
- `GET /api/v3/discovery/matches/:agentId`
- `GET /api/v3/discovery/opportunities`
- `POST /api/v3/discovery/message`
- `GET /api/v3/discovery/messages/:agentId`
- Existing MCP routes remain: `/mcp/join`, `/mcp/route`, `/mcp/status`, `/mcp/bodies`

## Missing external pieces

To make this live beyond local mode, provide:

1. Deployed server host or permission to create one.
2. Supabase URL.
3. Supabase service role key, stored as an environment variable, not pasted into public code.
4. DATABASE_URL if you want schema push via psql.
5. Which AI adapters you want first: OpenAI/ChatGPT, Claude, Gemini, local agent, or browser client.
6. For MCP proper: the actual MCP client/server transport target each AI can use.

