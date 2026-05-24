/**
 * Synthia Morphing MCP Orchestrator
 * No backend. Pure orchestration power.
 * You speak once. The substrate routes, delegates, tracks, and morphs.
 */

interface Agent {
  id: string;
  name: string;
  capabilities: string[];
  endpoint: string;  // MCP endpoint or stdio command
  protocol: 'mcp-stdio' | 'mcp-http' | 'websocket' | 'local';
  priority: number;
  maxConcurrent: number;
  currentLoad: number;
  status: 'idle' | 'busy' | 'offline';
  lastSeen: Date;
  metadata: Record<string, any>;
}

interface Intent {
  id: string;
  raw: string;
  parsed: ParsedIntent;
  context: IntentContext;
  timestamp: Date;
  routingStrategy: 'capability_match' | 'broadcast' | 'round_robin' | 'specific';
  targetAgents?: string[];
}

interface ParsedIntent {
  action: string;        // "build", "fix", "analyze", "deploy"
  domain: string[];      // ["frontend", "backend", "design"]
  entities: string[];    // ["auth", "jwt", "login-page"]
  constraints: {
    priority: 'low' | 'medium' | 'high' | 'critical';
    deadline?: Date;
    requirements: string[];
  };
}

interface IntentContext {
  projectId: string;
  featureId?: string;
  previousMessages: Message[];
  files?: string[];
  userState: Record<string, any>;
}

interface Message {
  id: string;
  from: string;
  to: string;
  type: 'context' | 'task' | 'question' | 'completion' | 'error' | 'relay';
  payload: any;
  timestamp: Date;
  acked: boolean;
  featureId?: string;
}

interface ProjectState {
  id: string;
  name: string;
  features: Feature[];
  agents: Map<string, AgentWorkload>;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

interface Feature {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in-progress' | 'blocked' | 'review' | 'done';
  priority: number;
  delegations: Delegation[];
  progress: number;  // 0-1
  blocks: string[];  // feature IDs blocking this
  outputs: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface Delegation {
  agentId: string;
  scope: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  output?: any;
  startedAt?: Date;
  completedAt?: Date;
}

interface AgentWorkload {
  agentId: string;
  activeTasks: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  currentFeatures: string[];
}

// ─── THE ORCHESTRATOR ───

class MorphOrchestrator {
  private agents: Map<string, Agent> = new Map();
  private projects: Map<string, ProjectState> = new Map();
  private messages: Message[] = [];
  private intentQueue: Intent[] = [];
  private listeners: Set<(event: OrchestratorEvent) => void> = new Set();

  // Local storage persistence (no backend needed)
  private storageKey = 'synthia_orchestrator_state';

  constructor() {
    this.loadState();
    this.startHealthCheck();
  }

  // ─── AGENT REGISTRY ───

  registerAgent(agent: Omit<Agent, 'currentLoad' | 'status' | 'lastSeen'>): Agent {
    const fullAgent: Agent = {
      ...agent,
      currentLoad: 0,
      status: 'idle',
      lastSeen: new Date()
    };
    this.agents.set(agent.id, fullAgent);
    this.emit({ type: 'agent_registered', agent: fullAgent });
    this.saveState();
    return fullAgent;
  }

  unregisterAgent(agentId: string): boolean {
    const removed = this.agents.delete(agentId);
    if (removed) {
      this.emit({ type: 'agent_unregistered', agentId });
      this.saveState();
    }
    return removed;
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  listAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  findAgentsByCapability(capability: string): Agent[] {
    return this.listAgents()
      .filter(a => a.capabilities.includes(capability))
      .sort((a, b) => a.priority - b.priority);
  }

  // ─── INTENT PROCESSING ───

  async submitIntent(rawIntent: string, context: IntentContext): Promise<Intent> {
    const intent: Intent = {
      id: this.generateId(),
      raw: rawIntent,
      parsed: this.parseIntent(rawIntent),
      context,
      timestamp: new Date(),
      routingStrategy: 'capability_match'
    };

    this.intentQueue.push(intent);
    this.emit({ type: 'intent_received', intent });

    // Auto-route
    await this.routeIntent(intent);

    return intent;
  }

  private parseIntent(raw: string): ParsedIntent {
    // Simple NLP — can be replaced with your MRNN
    const actionWords = ['build', 'create', 'make', 'fix', 'debug', 'deploy', 'analyze', 'refactor'];
    const domainWords = ['frontend', 'backend', 'ui', 'api', 'database', 'design', 'devops'];

    const lower = raw.toLowerCase();
    const action = actionWords.find(w => lower.includes(w)) || 'build';
    const domains = domainWords.filter(w => lower.includes(w));

    // Extract entities (nouns after action words)
    const entities = this.extractEntities(raw);

    return {
      action,
      domain: domains.length > 0 ? domains : ['general'],
      entities,
      constraints: {
        priority: lower.includes('urgent') || lower.includes('critical') ? 'critical' :
                 lower.includes('important') || lower.includes('high') ? 'high' :
                 lower.includes('low') ? 'low' : 'medium',
        requirements: []
      }
    };
  }

  private extractEntities(text: string): string[] {
    // Extract quoted strings, technical terms
    const quoted = text.match(/"([^"]+)"/g)?.map(s => s.slice(1, -1)) || [];
    const technical = text.match(/\b[A-Z][a-zA-Z]+\b/g) || [];
    return [...new Set([...quoted, ...technical])];
  }

  // ─── ROUTING ENGINE ───

  private async routeIntent(intent: Intent): Promise<void> {
    const { parsed, routingStrategy } = intent;
    let targetAgents: Agent[] = [];

    switch (routingStrategy) {
      case 'capability_match':
        // Find agents that can handle the domains
        for (const domain of parsed.domain) {
          const capable = this.findAgentsByCapability(domain);
          targetAgents.push(...capable);
        }
        // Deduplicate and sort by load
        targetAgents = [...new Map(targetAgents.map(a => [a.id, a])).values()]
          .sort((a, b) => a.currentLoad - b.currentLoad);
        break;

      case 'broadcast':
        targetAgents = this.listAgents().filter(a => a.status !== 'offline');
        break;

      case 'round_robin':
        targetAgents = this.listAgents()
          .filter(a => a.status !== 'offline')
          .sort((a, b) => a.currentLoad - b.currentLoad);
        break;

      case 'specific':
        targetAgents = (intent.targetAgents || [])
          .map(id => this.agents.get(id))
          .filter((a): a is Agent => a !== undefined);
        break;
    }

    // Don't overload
    targetAgents = targetAgents.filter(a => a.currentLoad < a.maxConcurrent);

    if (targetAgents.length === 0) {
      this.emit({ type: 'intent_blocked', intent, reason: 'no_available_agents' });
      return;
    }

    // Create feature if project context exists
    const project = this.getOrCreateProject(intent.context.projectId);
    const feature: Feature = {
      id: this.generateId(),
      name: parsed.entities[0] || 'unnamed-task',
      description: intent.raw,
      status: 'in-progress',
      priority: this.priorityToNumber(parsed.constraints.priority),
      delegations: [],
      progress: 0,
      blocks: [],
      outputs: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Delegate to each agent
    for (const agent of targetAgents.slice(0, 3)) {  // Max 3 agents per intent
      const delegation: Delegation = {
        agentId: agent.id,
        scope: this.generateScope(intent, agent),
        status: 'pending'
      };
      feature.delegations.push(delegation);

      // Send task message
      await this.sendMessage({
        id: this.generateId(),
        from: 'orchestrator',
        to: agent.id,
        type: 'task',
        payload: {
          intent: intent.raw,
          parsed: intent.parsed,
          featureId: feature.id,
          scope: delegation.scope
        },
        timestamp: new Date(),
        acked: false,
        featureId: feature.id
      });

      // Update agent load
      agent.currentLoad++;
      agent.status = 'busy';
    }

    project.features.push(feature);
    this.saveState();

    this.emit({ 
      type: 'intent_routed', 
      intent, 
      feature,
      agents: targetAgents.map(a => a.id)
    });
  }

  private generateScope(intent: Intent, agent: Agent): string {
    const { parsed } = intent;
    // Generate specific scope based on agent capabilities
    const relevantCaps = agent.capabilities.filter(c => 
      parsed.domain.includes(c) || parsed.entities.some(e => e.toLowerCase().includes(c))
    );

    if (relevantCaps.length > 0) {
      return `Handle ${relevantCaps.join(', ')} aspects of: ${parsed.entities.join(', ')}`;
    }
    return `General assistance with: ${intent.raw}`;
  }

  private priorityToNumber(p: string): number {
    return { critical: 5, high: 4, medium: 3, low: 2 }[p] || 3;
  }

  // ─── MESSAGE SYSTEM ───

  async sendMessage(msg: Omit<Message, 'id' | 'timestamp'> & { id?: string; timestamp?: Date }): Promise<Message> {
    const fullMsg: Message = {
      ...msg,
      id: msg.id || this.generateId(),
      timestamp: msg.timestamp || new Date()
    } as Message;

    this.messages.push(fullMsg);

    // If relaying between agents, auto-forward
    if (fullMsg.from !== 'orchestrator' && fullMsg.to !== 'orchestrator') {
      this.emit({ type: 'agent_relay', message: fullMsg });
    }

    this.saveState();
    return fullMsg;
  }

  getMessages(filter?: { from?: string; to?: string; featureId?: string; unacked?: boolean }): Message[] {
    return this.messages.filter(m => {
      if (filter?.from && m.from !== filter.from) return false;
      if (filter?.to && m.to !== filter.to) return false;
      if (filter?.featureId && m.featureId !== filter.featureId) return false;
      if (filter?.unacked && m.acked) return false;
      return true;
    });
  }

  // ─── PROJECT STATE ───

  getOrCreateProject(projectId: string): ProjectState {
    if (!this.projects.has(projectId)) {
      this.projects.set(projectId, {
        id: projectId,
        name: projectId,
        features: [],
        agents: new Map(),
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    return this.projects.get(projectId)!;
  }

  getProjectStatus(projectId: string): ProjectState | undefined {
    return this.projects.get(projectId);
  }

  updateFeature(featureId: string, updates: Partial<Feature>): boolean {
    for (const project of this.projects.values()) {
      const feature = project.features.find(f => f.id === featureId);
      if (feature) {
        Object.assign(feature, updates, { updatedAt: new Date() });
        this.saveState();
        this.emit({ type: 'feature_updated', feature });
        return true;
      }
    }
    return false;
  }

  // ─── MORPHING VISUAL STATUS ───

  getMorphData(): MorphSnapshot {
    const projects = Array.from(this.projects.values());
    const agents = this.listAgents();

    return {
      timestamp: new Date(),
      summary: {
        totalProjects: projects.length,
        totalFeatures: projects.reduce((sum, p) => sum + p.features.length, 0),
        activeAgents: agents.filter(a => a.status === 'busy').length,
        idleAgents: agents.filter(a => a.status === 'idle').length,
        offlineAgents: agents.filter(a => a.status === 'offline').length,
        pendingMessages: this.messages.filter(m => !m.acked).length
      },
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        featureCount: p.features.length,
        completionRate: p.features.length > 0 
          ? p.features.filter(f => f.status === 'done').length / p.features.length 
          : 0,
        features: p.features.map(f => ({
          id: f.id,
          name: f.name,
          status: f.status,
          progress: f.progress,
          agents: f.delegations.map(d => d.agentId),
          blocks: f.blocks
        }))
      })),
      agentNetwork: agents.map(a => ({
        id: a.id,
        name: a.name,
        status: a.status,
        load: a.currentLoad / a.maxConcurrent,
        capabilities: a.capabilities,
        lastSeen: a.lastSeen
      })),
      recentMessages: this.messages.slice(-20).map(m => ({
        from: m.from,
        to: m.to,
        type: m.type,
        featureId: m.featureId,
        timestamp: m.timestamp
      }))
    };
  }

  // ─── PERSISTENCE (NO BACKEND) ───

  private saveState(): void {
    const state = {
      agents: Array.from(this.agents.entries()),
      projects: Array.from(this.projects.entries()).map(([id, p]) => [
        id, 
        { ...p, agents: Array.from(p.agents.entries()) }
      ]),
      messages: this.messages.slice(-1000),  // Keep last 1000
      timestamp: new Date()
    };

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch (e) {
      // Fallback: keep in memory only
      console.warn('LocalStorage full, keeping state in memory');
    }
  }

  private loadState(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const state = JSON.parse(raw);
        this.agents = new Map(state.agents);
        this.projects = new Map(
          state.projects.map(([id, p]: [string, any]) => [
            id, 
            { ...p, agents: new Map(p.agents) }
          ])
        );
        this.messages = state.messages || [];
      }
    } catch (e) {
      console.warn('Failed to load state, starting fresh');
    }
  }

  // ─── HEALTH CHECK ───

  private startHealthCheck(): void {
    setInterval(() => {
      const now = new Date();
      for (const agent of this.agents.values()) {
        const minutesSinceSeen = (now.getTime() - agent.lastSeen.getTime()) / 60000;
        if (minutesSinceSeen > 5) {
          agent.status = 'offline';
          this.emit({ type: 'agent_offline', agentId: agent.id });
        }
      }
      this.saveState();
    }, 30000);  // Every 30s
  }

  // ─── EVENT SYSTEM ───

  on(event: (e: OrchestratorEvent) => void): () => void {
    this.listeners.add(event);
    return () => this.listeners.delete(event);
  }

  private emit(event: OrchestratorEvent): void {
    this.listeners.forEach(l => {
      try { l(event); } catch (e) { console.error(e); }
    });
  }

  // ─── UTILS ───

  private generateId(): string {
    return 'syn_' + Math.random().toString(36).substring(2, 15);
  }
}

// ─── EVENT TYPES ───

type OrchestratorEvent = 
  | { type: 'agent_registered'; agent: Agent }
  | { type: 'agent_unregistered'; agentId: string }
  | { type: 'agent_offline'; agentId: string }
  | { type: 'intent_received'; intent: Intent }
  | { type: 'intent_routed'; intent: Intent; feature: Feature; agents: string[] }
  | { type: 'intent_blocked'; intent: Intent; reason: string }
  | { type: 'feature_updated'; feature: Feature }
  | { type: 'agent_relay'; message: Message };

interface MorphSnapshot {
  timestamp: Date;
  summary: {
    totalProjects: number;
    totalFeatures: number;
    activeAgents: number;
    idleAgents: number;
    offlineAgents: number;
    pendingMessages: number;
  };
  projects: any[];
  agentNetwork: any[];
  recentMessages: any[];
}

export { MorphOrchestrator, Agent, Intent, Message, Feature, ProjectState, MorphSnapshot };
export type { OrchestratorEvent, ParsedIntent, Delegation };
