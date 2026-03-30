export interface CustomProvider {
    name: string;
    harness: 'claude' | 'codex' | 'native-openai';  // which CLI or SDK to use
    base_url: string;
    api_key: string;
    model?: string;               // model name to pass to the CLI / API
}

export interface AgentConfig {
    name: string;
    provider: string;       // 'anthropic', 'openai', 'opencode', or 'custom:<provider_id>'
    model: string;           // e.g. 'sonnet', 'opus', 'gpt-5.3-codex'
    working_directory: string;
    system_prompt?: string;
    prompt_file?: string;
    heartbeat?: {
        enabled?: boolean;
        interval?: number;
    };
    skills?: string[];  // skill IDs to enable; omit or null = all available skills
    permissions?: AgentPermissions;
}

// ── Blueprint Agent (team template, lives in ~/.tinyagi/blueprints/<id>/) ──

export interface BlueprintAgent {
    id: string;
    name: string;
    provider: string;
    model: string;
    skills?: string[];
    created_at: number;
    updated_at: number;
    copied_from?: string;   // Task Agent ID if cloned
}

// ── Team Member (blueprint + role + permissions inside a team) ──

export interface TeamMemberPermissions {
    filesystem: 'read' | 'write' | 'none';
    browser: boolean;
    network: boolean;
    skills: string[] | 'all' | 'none';
    sandbox_mode: 'full' | 'restricted';
}

export interface TeamMember {
    agent_id: string;              // BlueprintAgent.id
    role_tag: string;
    role_prompt?: string;
    permissions: TeamMemberPermissions;
}

export const DEFAULT_TEAM_MEMBER_PERMISSIONS: TeamMemberPermissions = {
    filesystem: 'write',
    browser: false,
    network: true,
    skills: 'all',
    sandbox_mode: 'full',
};

// ── Team (redesigned) ──

export interface TeamConfig {
    name: string;
    team_prompt?: string;
    working_directory?: string;
    members: TeamMember[];          // was: agents: string[]
    leader_agent: string;
    team_skills?: string[];
}

// ── Project Assignment Types ──

export interface ProjectTeam {
    team_id: string;
    role_tag: string;
    role_description?: string;
}

export interface ProjectAgent {
    agent_id: string;
    role_tag?: string;
    role_description?: string;
}

// ── Project (redesigned) ──

export interface ProjectConfig {
    id: string;
    name: string;
    description: string;
    context_prompt?: string;
    status: 'active' | 'archived';
    skills?: string[];
    memory_enabled?: boolean;
    assigned_teams: ProjectTeam[];
    assigned_agents: ProjectAgent[];
    created_at: number;
    updated_at: number;
}

export interface Settings {
    workspace?: {
        path?: string;
        name?: string;
    };
    channels?: {
        enabled?: string[];
        discord?: { bot_token?: string };
        telegram?: { bot_token?: string };
        whatsapp?: {};
        defaults?: Record<string, { agentId: string }>;
    };
    models?: {
        provider?: string; // 'anthropic', 'openai', or 'opencode'
        anthropic?: {
            model?: string;
            auth_token?: string;
        };
        openai?: {
            model?: string;
            auth_token?: string;
        };
        opencode?: {
            model?: string;
        };
    };
    agents?: Record<string, AgentConfig>;
    custom_providers?: Record<string, CustomProvider>;
    teams?: Record<string, TeamConfig>;
    monitoring?: {
        heartbeat_interval?: number;
    };
    directories?: string[];  // known/connected working directories
}

export interface MessageData {
    channel: string;
    sender: string;
    senderId?: string;
    message: string;
    timestamp: number;
    messageId: string;
    agent?: string; // optional: pre-routed agent id from channel client
    fromAgent?: string; // which agent sent this internal message
}

export interface ResponseData {
    channel: string;
    sender: string;
    message: string;
    originalMessage: string;
    timestamp: number;
    messageId: string;
    agent?: string; // which agent handled this
    files?: string[];
    metadata?: Record<string, unknown>;
}

// --- Model Registry Types ---

export interface ModelCapabilities {
    context_window: number;
    max_output_tokens?: number;
    supports_tools: boolean;
    supports_vision: boolean;
    supports_streaming: boolean;
}

export interface ModelDefinition {
    id: string;                   // e.g. "claude-sonnet-4-6"
    vendor: string;               // e.g. "anthropic", "openai", "local"
    display_name: string;         // e.g. "Claude Sonnet 4.6"
    harness: 'claude' | 'codex' | 'opencode' | 'native-openai' | 'claude-code';
    aliases: string[];            // e.g. ["sonnet"]
    is_code_agent?: boolean;      // true for claude-code type
    capabilities: ModelCapabilities;
    // Extended metadata (from custom provider discovery)
    description?: string;
    tier?: string;                // "fast", "code", "general", "reasoning", "embed", "cloud"
    vram_gb?: number;
    installed?: boolean;
    available?: boolean;
    category?: 'local_installed' | 'local_recommended' | 'cloud';
    pull_cmd?: string;            // for recommended models that can be pulled
}

// --- Agent Permissions ---

export interface AgentPermissions {
    filesystem: 'read' | 'write' | 'none';
    browser: boolean;
    network: boolean;
    skills: string[] | 'all' | 'none';
    sandbox_mode: 'full' | 'restricted';
    allowed_directories: string[];
}

export const DEFAULT_PERMISSIONS: AgentPermissions = {
    filesystem: 'write',
    browser: false,
    network: true,
    skills: 'all',
    sandbox_mode: 'full',
    allowed_directories: [],
};

// --- Session (agent tab) ---

export interface SessionConfig {
    id: string;
    name: string;
    provider: string;
    model: string;
    working_directory: string;
    permissions: AgentPermissions;
    skills?: string[];
    system_prompt?: string;
    created_at: number;
    last_active_at: number;
}

// Shorthand model aliases — everything else passes through as-is to the CLI.
export const MODEL_ALIASES: Record<string, Record<string, string>> = {
    anthropic: {
        'sonnet': 'claude-sonnet-4-6',
        'opus': 'claude-opus-4-6',
    },
    openai: {},
    opencode: {
        'sonnet': 'opencode/claude-sonnet-4-6',
        'opus': 'opencode/claude-opus-4-6',
    },
};

// Schedule types
export interface Schedule {
    id: string;
    label: string;
    cron: string;           // 5-field cron expression (empty for one-time)
    agentId: string;
    message: string;
    channel: string;        // default "schedule"
    sender: string;         // default "Scheduler"
    enabled: boolean;
    createdAt: number;      // epoch ms
    runAt?: string;         // ISO date string for one-time schedules
}

// Queue job data types
export interface MessageJobData {
    channel: string;
    sender: string;
    senderId?: string;
    message: string;
    messageId: string;
    agent?: string;
    fromAgent?: string;
}

export interface ResponseJobData {
    channel: string;
    sender: string;
    senderId?: string;
    message: string;
    originalMessage: string;
    messageId: string;
    agent?: string;
    files?: string[];
    metadata?: Record<string, unknown>;
}
