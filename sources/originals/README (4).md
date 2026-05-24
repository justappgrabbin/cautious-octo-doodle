# Synthia Morph Orchestrator

> **You speak once. The substrate routes, delegates, tracks, and morphs.**

A browser-native, backend-free orchestration layer that connects your Synthia OS to any MCP-compatible AI agent — Claude, GPT, your HuggingFace models, local daemons, and the [gilbarbara Agent Hub MCP](https://github.com/gilbarbara/agent-hub-mcp).

## What This Does

Instead of copy-pasting the same prompt across 5 different AI tools, you:

1. **Speak once** into the intent composer
2. The **substrate parses** your intent into action + domain + entities
3. It **finds the right agents** based on capabilities
4. It **creates a feature** in your project
5. It **delegates tasks** to each agent via MCP
6. It **tracks progress** in real-time with a morphing visual dashboard
7. It **relays messages** between agents so they coordinate without you repeating yourself

## Files

| File | Purpose |
|------|---------|
| `morph-orchestrator-core.ts` | The brain — intent parsing, routing, state tracking, persistence |
| `mcp-bridge.ts` | MCP protocol layer — connects to Claude, GPT, HF, your server, Termux |
| `morph-dashboard.tsx` | React visual dashboard — network graph, timeline, matrix, live messages |
| `morph-bootstrap.ts` | Glue — wires everything together, provides usage examples |
| `morph-orchestrator-demo.html` | **Standalone demo** — open in browser, works immediately |

## Quick Start

### Option 1: Just See It Work (30 seconds)

Open `morph-orchestrator-demo.html` in any browser. No build step. No server. It simulates the full orchestration loop with 6 agents and shows the morphing network visualization.

### Option 2: Use in Your Project

```bash
# 1. Drop the files into your project
cp morph-*.ts your-project/src/

# 2. Install dependencies
npm install

# 3. Import and initialize
import { initMorphSubstrate } from './morph-bootstrap';

const { orchestrator, mcpBridge, hubBridge } = initMorphSubstrate();
```

### Option 3: Connect to gilbarbara's Agent Hub

```typescript
const { hubBridge } = initMorphSubstrate();

// Connect to the public hub
await hubBridge.connectToHub();

// Register Synthia as an agent
await hubBridge.registerWithHub('synthia-morph', [
  'orchestration',
  'project-tracking',
  'agent-coordination'
]);

// Now your agents can talk to agents on other people's machines
const syncData = await hubBridge.syncWithHub();
```

## Usage Examples

### Register an Agent

```typescript
orchestrator.registerAgent({
  id: 'joe-cursor',
  name: "Joe's Cursor",
  capabilities: ['typescript', 'react', 'ui-design'],
  endpoint: 'mcp://joe-laptop.local:3001',
  protocol: 'mcp-http',
  priority: 2,
  maxConcurrent: 2
});
```

### Submit an Intent (You Speak Once)

```typescript
const intent = await orchestrator.submitIntent(
  "Build JWT auth with React frontend and Node backend. Make agents coordinate on API contract.",
  { projectId: 'synthia-dashboard' }
);

// The substrate:
// 1. Parsed: action=build, domain=[frontend, backend], entities=[jwt, auth, react, node]
// 2. Found: claude-local (frontend), gpt-local (backend)
// 3. Created: feature "jwt-auth" in project "synthia-dashboard"
// 4. Delegated: scope to each agent
// 5. Sent: MCP task messages to activate them
// 6. Tracking: progress bars update in real-time
```

### Check Status (The Morph Tells You)

```typescript
const status = orchestrator.getMorphData();

// Returns:
// - Network graph data (agent positions, load, connections)
// - Project timelines (feature progress, completion rates)
// - Feature matrix (who's doing what, what's blocked)
// - Live message stream (agent-to-agent communication)
```

### Relay Between Agents (No Repeating Yourself)

```typescript
// Claude finished the API. Auto-send to frontend agent.
orchestrator.sendMessage({
  from: 'claude-local',
  to: 'joe-cursor',
  type: 'relay',
  payload: { apiContract: { endpoints: [...] } }
});

// Joe's agent gets it. You never touched it.
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    INTENT SURFACE                        │
│   Voice / Text / FileDrop / CommandPalette / ProjectLens │
├─────────────────────────────────────────────────────────┤
│                  ORCHESTRATION CORE                        │
│   IntentParser → CapabilityMatcher → AgentRouter → State │
├─────────────────────────────────────────────────────────┤
│                   MCP BRIDGE LAYER                         │
│   MCPClient → AgentHubConnector → LocalBridge → Queue    │
├─────────────────────────────────────────────────────────┤
│                    AGENT NETWORK                           │
│   Claude │ GPT │ HF Stellar │ Synthia Server │ Termux    │
├─────────────────────────────────────────────────────────┤
│                 SYNTHESIS & MORPH                        │
│   ResponseMerger → ConflictResolver → StateRenderer      │
└─────────────────────────────────────────────────────────┘
```

## No Backend Philosophy

Everything persists to `localStorage`. The orchestrator runs in your browser or as a local daemon. When you need cross-device sync, it delegates to your Synthia Server on Render or the Agent Hub MCP — but the core intelligence lives locally.

## Your Infrastructure

- **synthia-server.onrender.com** — persistence, user management, broadcast
- **HuggingFace stellarproximology** — neural computation, astrology, human design
- **Termux daemon** — system admin, deployment, file operations
- **gilbarbara/agent-hub-mcp** — cross-agent coordination layer

No OpenAI. No Claude API. Your own mesh.

## License

MIT — build your civilization.
