/**
 * Synthia Morph Orchestrator — Bootstrap & Usage
 * 
 * This is how you wire everything together.
 * No backend. Just orchestration power.
 */

import { MorphOrchestrator } from './morph-orchestrator-core';
import { MCPBridge, AgentHubBridge, DEFAULT_AGENT_CONFIGS } from './mcp-bridge';
import MorphDashboard from './morph-dashboard';

// ─── SINGLETON SETUP ───

let orchestrator: MorphOrchestrator | null = null;
let mcpBridge: MCPBridge | null = null;
let hubBridge: AgentHubBridge | null = null;

export function initMorphSubstrate(): {
  orchestrator: MorphOrchestrator;
  mcpBridge: MCPBridge;
  hubBridge: AgentHubBridge;
} {
  if (orchestrator) return { orchestrator, mcpBridge: mcpBridge!, hubBridge: hubBridge! };

  // 1. Create the orchestrator
  orchestrator = new MorphOrchestrator();

  // 2. Create the MCP bridge
  mcpBridge = new MCPBridge();

  // 3. Connect to Agent Hub (gilbarbara's MCP)
  hubBridge = new AgentHubBridge(mcpBridge);

  // 4. Register your default agents
  setupDefaultAgents(orchestrator, mcpBridge);

  // 5. Wire orchestrator events to auto-relay via MCP
  wireEventRelay(orchestrator, mcpBridge);

  console.log('🧬 Synthia Morph Substrate initialized');
  console.log('   Speak once. The substrate routes.');

  return { orchestrator, mcpBridge, hubBridge };
}

async function setupDefaultAgents(
  orchestrator: MorphOrchestrator,
  mcpBridge: MCPBridge
) {
  // Register local conceptual agents (these map to your actual MCP endpoints)
  for (const config of DEFAULT_AGENT_CONFIGS) {
    orchestrator.registerAgent({
      id: config.id,
      name: config.name,
      capabilities: config.capabilities,
      endpoint: config.url || `stdio://${config.command}`,
      protocol: config.protocol === 'stdio' ? 'mcp-stdio' : 
                  config.protocol === 'http' ? 'mcp-http' : 'websocket',
      priority: 1,
      maxConcurrent: 3,
      metadata: { source: 'default-config' }
    });

    // Try to connect MCP bridge
    try {
      await mcpBridge.connectAgent(config);
    } catch (e) {
      console.warn(`Could not connect ${config.name} via MCP:`, e);
    }
  }
}

function wireEventRelay(
  orchestrator: MorphOrchestrator,
  mcpBridge: MCPBridge
) {
  orchestrator.on(async (event) => {
    // When an intent is routed, auto-relay to connected MCP agents
    if (event.type === 'intent_routed') {
      for (const agentId of event.agents) {
        await mcpBridge.callTool(agentId, 'handle_task', {
          featureId: event.feature.id,
          intent: event.intent.raw,
          scope: event.intent.parsed.domain
        });
      }
    }

    // When a feature updates, broadcast to all agents working on it
    if (event.type === 'feature_updated') {
      const feature = event.feature;
      for (const delegation of feature.delegations) {
        if (delegation.status === 'in-progress') {
          await mcpBridge.callTool(delegation.agentId, 'sync_context', {
            featureId: feature.id,
            status: feature.status,
            progress: feature.progress,
            outputs: feature.outputs
          });
        }
      }
    }
  });
}

// ─── USAGE EXAMPLES ───

/**
 * Example 1: Register a new agent in your network
 */
export function exampleRegisterAgent() {
  const { orchestrator } = initMorphSubstrate();

  orchestrator.registerAgent({
    id: 'joe-cursor',
    name: "Joe's Cursor Agent",
    capabilities: ['typescript', 'react', 'ui-design', 'tailwind'],
    endpoint: 'mcp://joe-laptop.local:3001',
    protocol: 'mcp-http',
    priority: 2,
    maxConcurrent: 2,
    metadata: { owner: 'joe', location: 'local-network' }
  });
}

/**
 * Example 2: Submit an intent — you speak once
 */
export async function exampleSubmitIntent() {
  const { orchestrator } = initMorphSubstrate();

  const intent = await orchestrator.submitIntent(
    "Build a user authentication system with JWT tokens, a login page in React, and a Node.js backend. Make the frontend and backend agents coordinate so they agree on the API contract.",
    {
      projectId: 'synthia-dashboard',
      previousMessages: [],
      userState: { preferredStack: 'react-node' }
    }
  );

  console.log('Intent submitted:', intent.id);
  console.log('Routed to domains:', intent.parsed.domain);

  // The orchestrator automatically:
  // 1. Parsed your intent into action/domain/entities
  // 2. Found agents with matching capabilities
  // 3. Created a feature in the project
  // 4. Delegated tasks to each agent
  // 5. Sent MCP messages to activate them
  // 6. Started tracking progress
}

/**
 * Example 3: Check project status — the morph tells you where things are
 */
export function exampleCheckStatus() {
  const { orchestrator } = initMorphSubstrate();

  const status = orchestrator.getMorphData();

  console.log('Projects:', status.summary.totalProjects);
  console.log('Active agents:', status.summary.activeAgents);

  for (const project of status.projects) {
    console.log(`\n📁 ${project.name}`);
    for (const feature of project.features) {
      const emoji = feature.status === 'done' ? '✅' :
                    feature.status === 'in-progress' ? '🔨' :
                    feature.status === 'blocked' ? '⛔' : '⏳';
      console.log(`  ${emoji} ${feature.name} (${Math.round(feature.progress * 100)}%)`);
      console.log(`     Agents: ${feature.agents.join(', ')}`);
    }
  }
}

/**
 * Example 4: Relay a message between agents — no repeating yourself
 */
export async function exampleRelayMessage() {
  const { orchestrator } = initMorphSubstrate();

  // Claude finished the API design. Auto-send it to the frontend agent.
  await orchestrator.sendMessage({
    from: 'claude-local',
    to: 'joe-cursor',
    type: 'relay',
    payload: {
      apiContract: {
        endpoints: [
          { method: 'POST', path: '/auth/login', body: '{email, password}' },
          { method: 'GET', path: '/auth/me', auth: 'bearer' }
        ]
      }
    },
    acked: false,
    featureId: 'feature-123'
  });

  // Joe's agent gets this automatically. No need for you to copy-paste.
}

/**
 * Example 5: Connect to gilbarbara's Agent Hub MCP
 */
export async function exampleConnectToHub() {
  const { hubBridge } = initMorphSubstrate();

  // Connect to the public Agent Hub
  const connected = await hubBridge.connectToHub();

  if (connected) {
    // Register this Synthia instance as an agent
    await hubBridge.registerWithHub('synthia-morph', [
      'orchestration',
      'project-tracking',
      'agent-coordination',
      'morph-rendering'
    ]);

    // Sync with other agents on the hub
    const syncData = await hubBridge.syncWithHub();
    console.log('Hub sync:', syncData);
  }
}

/**
 * Example 6: React component usage
 */
export function exampleReactUsage() {
  // In your React app:
  /*
  import { initMorphSubstrate } from './bootstrap';
  import MorphDashboard from './morph-dashboard';

  function App() {
    const { orchestrator } = initMorphSubstrate();

    return (
      <div>
        <MorphDashboard orchestrator={orchestrator} />
      </div>
    );
  }
  */
}

// ─── EXPORTS ───

export { MorphOrchestrator, MCPBridge, AgentHubBridge, MorphDashboard };
export { initMorphSubstrate };
