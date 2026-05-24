/**
 * MCP Bridge Layer
 * Speaks Model Context Protocol to connect your Morph Substrate
 * to Claude, GPT, local models, and any MCP-compatible agent.
 * No backend server needed — runs via stdio or local HTTP.
 */

interface MCPRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string;
  result?: any;
  error?: { code: number; message: string };
}

interface MCPAgentConfig {
  id: string;
  name: string;
  command?: string;        // For stdio: "npx", "python", etc.
  args?: string[];         // Arguments for stdio command
  url?: string;            // For HTTP: endpoint URL
  headers?: Record<string, string>;
  capabilities: string[];
  protocol: 'stdio' | 'http' | 'websocket';
  env?: Record<string, string>;
}

class MCPBridge {
  private agents: Map<string, MCPAgentConnection> = new Map();
  private messageHandlers: Map<string, (msg: any) => void> = new Map();
  private requestCounter = 0;

  async connectAgent(config: MCPAgentConfig): Promise<boolean> {
    try {
      let connection: MCPAgentConnection;

      if (config.protocol === 'stdio') {
        connection = await this.connectStdio(config);
      } else if (config.protocol === 'http') {
        connection = await this.connectHTTP(config);
      } else if (config.protocol === 'websocket') {
        connection = await this.connectWebSocket(config);
      } else {
        throw new Error(`Unknown protocol: ${config.protocol}`);
      }

      this.agents.set(config.id, connection);

      // Initialize with MCP initialize method
      const initResult = await this.sendRequest(config.id, {
        jsonrpc: '2.0',
        id: this.nextId(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'SynthiaMorph', version: '1.0.0' }
        }
      });

      if (initResult) {
        console.log(`✅ MCP Agent connected: ${config.name} (${config.id})`);
        return true;
      }

      return false;
    } catch (err) {
      console.error(`❌ Failed to connect ${config.name}:`, err);
      return false;
    }
  }

  private async connectStdio(config: MCPAgentConfig): Promise<MCPAgentConnection> {
    // Browser-compatible: use Web Workers or Service Workers to spawn processes
    // For now, we simulate with a message channel

    const channel = new MessageChannel();

    // In a real implementation, this would spawn the process via
    // a native bridge (Termux, Electron, or a local daemon)

    return {
      id: config.id,
      protocol: 'stdio',
      send: async (msg: MCPRequest) => {
        // Route to the spawned process
        channel.port1.postMessage(msg);

        // Wait for response
        return new Promise((resolve) => {
          const handler = (e: MessageEvent) => {
            if (e.data.id === msg.id) {
              channel.port1.removeEventListener('message', handler);
              resolve(e.data);
            }
          };
          channel.port1.addEventListener('message', handler);
        });
      },
      close: () => {
        channel.port1.close();
        channel.port2.close();
      }
    };
  }

  private async connectHTTP(config: MCPAgentConfig): Promise<MCPAgentConnection> {
    return {
      id: config.id,
      protocol: 'http',
      send: async (msg: MCPRequest) => {
        const response = await fetch(config.url!, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...config.headers
          },
          body: JSON.stringify(msg)
        });
        return response.json();
      },
      close: () => {
        // HTTP is stateless, nothing to close
      }
    };
  }

  private async connectWebSocket(config: MCPAgentConfig): Promise<MCPAgentConnection> {
    const ws = new WebSocket(config.url!);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
    });

    const pendingRequests = new Map<string, (res: MCPResponse) => void>();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pendingRequests.has(msg.id)) {
        pendingRequests.get(msg.id)!(msg);
        pendingRequests.delete(msg.id);
      }
    };

    return {
      id: config.id,
      protocol: 'websocket',
      send: async (msg: MCPRequest) => {
        return new Promise((resolve) => {
          pendingRequests.set(msg.id, resolve);
          ws.send(JSON.stringify(msg));
        });
      },
      close: () => ws.close()
    };
  }

  async sendRequest(agentId: string, request: MCPRequest): Promise<MCPResponse | null> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.error(`Agent ${agentId} not connected`);
      return null;
    }

    try {
      const response = await agent.send(request);
      return response;
    } catch (err) {
      console.error(`Request to ${agentId} failed:`, err);
      return null;
    }
  }

  async callTool(agentId: string, toolName: string, args: any): Promise<any> {
    const response = await this.sendRequest(agentId, {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'tools/call',
      params: { name: toolName, arguments: args }
    });
    return response?.result;
  }

  async listTools(agentId: string): Promise<string[]> {
    const response = await this.sendRequest(agentId, {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'tools/list'
    });
    return response?.result?.tools?.map((t: any) => t.name) || [];
  }

  disconnectAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.close();
      this.agents.delete(agentId);
    }
  }

  listConnectedAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  private nextId(): string {
    return `req_${++this.requestCounter}`;
  }
}

interface MCPAgentConnection {
  id: string;
  protocol: 'stdio' | 'http' | 'websocket';
  send: (msg: MCPRequest) => Promise<MCPResponse>;
  close: () => void;
}

// ─── AGENT HUB INTEGRATION ───

class AgentHubBridge {
  private bridge: MCPBridge;
  private hubAgentId: string | null = null;

  constructor(bridge: MCPBridge) {
    this.bridge = bridge;
  }

  async connectToHub(hubUrl: string = 'https://agent-hub-mcp.onrender.com'): Promise<boolean> {
    // Connect to the gilbarbara Agent Hub MCP
    const connected = await this.bridge.connectAgent({
      id: 'agent-hub',
      name: 'Agent Hub MCP',
      url: hubUrl,
      protocol: 'http',
      capabilities: ['agent-coordination', 'message-relay', 'project-sync'],
      headers: {
        'X-Client-Name': 'SynthiaMorph',
        'X-Client-Version': '1.0.0'
      }
    });

    if (connected) {
      this.hubAgentId = 'agent-hub';
      console.log('🔗 Connected to Agent Hub MCP');
    }

    return connected;
  }

  async registerWithHub(agentName: string, capabilities: string[]): Promise<boolean> {
    if (!this.hubAgentId) return false;

    const result = await this.bridge.callTool(this.hubAgentId, 'register_agent', {
      name: agentName,
      capabilities,
      projectPath: window.location.pathname
    });

    return result?.success || false;
  }

  async syncWithHub(): Promise<any> {
    if (!this.hubAgentId) return null;
    return this.bridge.callTool(this.hubAgentId, 'sync', {});
  }

  async sendHubMessage(to: string, message: any): Promise<boolean> {
    if (!this.hubAgentId) return false;

    const result = await this.bridge.callTool(this.hubAgentId, 'send_message', {
      to,
      type: message.type || 'context',
      payload: message
    });

    return result?.success || false;
  }
}

// ─── YOUR SPECIFIC AGENT CONFIGURATIONS ───

const DEFAULT_AGENT_CONFIGS: MCPAgentConfig[] = [
  {
    id: 'claude-local',
    name: 'Claude Code',
    command: 'claude',
    args: ['mcp', 'serve'],
    protocol: 'stdio',
    capabilities: ['code-generation', 'typescript', 'react', 'architecture', 'debugging']
  },
  {
    id: 'gpt-local',
    name: 'GPT Agent',
    // Requires local GPT wrapper or OpenAI-compatible endpoint
    url: 'http://localhost:3002/mcp',
    protocol: 'http',
    capabilities: ['code-generation', 'python', 'analysis', 'documentation']
  },
  {
    id: 'hf-stellar',
    name: 'HuggingFace StellarProximology',
    url: 'https://api-inference.huggingface.co/models/stellarproximology/',
    protocol: 'http',
    headers: {
      'Authorization': 'Bearer ${HF_TOKEN}'  // Set via env
    },
    capabilities: ['neural-computation', 'astrology', 'human-design', 'pattern-recognition']
  },
  {
    id: 'synthia-server',
    name: 'Synthia Server',
    url: 'https://synthia-server.onrender.com/mcp',
    protocol: 'http',
    capabilities: ['orchestration', 'data-persistence', 'user-management', 'broadcast']
  },
  {
    id: 'termux-daemon',
    name: 'Termux Daemon',
    command: 'termux-mcp-server',
    args: [],
    protocol: 'stdio',
    capabilities: ['system-admin', 'deployment', 'file-operations', 'process-management']
  }
];

export { MCPBridge, AgentHubBridge, DEFAULT_AGENT_CONFIGS };
export type { MCPRequest, MCPResponse, MCPAgentConfig, MCPAgentConnection };
