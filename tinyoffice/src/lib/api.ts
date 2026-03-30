const DEFAULT_API_BASE = "http://localhost:3777";
const STORAGE_KEY = "tinyagi_api_base";

/** Resolve the API base URL. Priority: env > localStorage > default. */
export function getApiBase(): string {
  // Env var always wins (set at build time via NEXT_PUBLIC_*)
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  }
  return DEFAULT_API_BASE;
}

/** Persist a custom API base URL in localStorage. Pass null to reset to default. */
export function setApiBase(url: string | null): void {
  if (url) {
    localStorage.setItem(STORAGE_KEY, url);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/** Check if the TinyAGI API is reachable at the given (or current) base URL. */
export async function checkConnection(baseUrl?: string): Promise<boolean> {
  const base = baseUrl ?? getApiBase();
  try {
    const res = await fetch(`${base}/api/settings`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const API_BASE = getApiBase();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface AgentPermissions {
  filesystem: "read" | "write" | "none";
  browser: boolean;
  network: boolean;
  skills: string[] | "all" | "none";
  sandbox_mode: "full" | "restricted";
  allowed_directories: string[];
}

export interface AgentConfig {
  name: string;
  provider: string;
  model: string;
  working_directory: string;
  system_prompt?: string;
  prompt_file?: string;
  heartbeat?: {
    enabled?: boolean;
    interval?: number;
  };
  permissions?: AgentPermissions;
  skills?: string[];
}

export interface ModelCapabilities {
  context_window: number;
  max_output_tokens?: number;
  supports_tools: boolean;
  supports_vision: boolean;
  supports_streaming: boolean;
}

export interface ModelDefinition {
  id: string;
  vendor: string;
  display_name: string;
  harness: string;
  aliases: string[];
  is_code_agent?: boolean;
  capabilities: ModelCapabilities;
  description?: string;
  tier?: string;
  vram_gb?: number;
  installed?: boolean;
  available?: boolean;
  category?: "local_installed" | "local_recommended" | "cloud";
  pull_cmd?: string;
}

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

// ── Blueprint Agent ────────────────────────────────────────────────────────

export interface BlueprintAgent {
  id: string;
  name: string;
  provider: string;
  model: string;
  skills?: string[];
  created_at: number;
  updated_at: number;
  copied_from?: string;
}

// ── Team (redesigned) ──────────────────────────────────────────────────────

export interface TeamMemberPermissions {
  filesystem: "read" | "write" | "none";
  browser: boolean;
  network: boolean;
  skills: string[] | "all" | "none";
  sandbox_mode: "full" | "restricted";
}

export interface TeamMember {
  agent_id: string;
  role_tag: string;
  role_prompt?: string;
  permissions: TeamMemberPermissions;
}

export interface TeamConfig {
  name: string;
  team_prompt?: string;
  working_directory?: string;
  members: TeamMember[];
  leader_agent: string;
  team_skills?: string[];
}

export const DEFAULT_TEAM_MEMBER_PERMISSIONS: TeamMemberPermissions = {
  filesystem: "write",
  browser: false,
  network: true,
  skills: "all",
  sandbox_mode: "full",
};

export interface Settings {
  workspace?: { path?: string; name?: string };
  channels?: {
    enabled?: string[];
    discord?: { bot_token?: string };
    telegram?: { bot_token?: string };
    whatsapp?: Record<string, unknown>;
  };
  models?: {
    provider?: string;
    anthropic?: { model?: string };
    openai?: { model?: string };
    opencode?: { model?: string };
  };
  agents?: Record<string, AgentConfig>;
  teams?: Record<string, TeamConfig>;
  monitoring?: { heartbeat_interval?: number };
}

export interface QueueStatus {
  incoming: number;
  processing: number;
  outgoing: number;
  activeConversations: number;
}

export interface ResponseData {
  channel: string;
  sender: string;
  message: string;
  originalMessage: string;
  timestamp: number;
  messageId: string;
  agent?: string;
  files?: string[];
}

export interface EventData {
  type: string;
  timestamp: number;
  [key: string]: unknown;
}

export interface AgentMessage {
  id: number;
  agent_id: string;
  role: "user" | "assistant";
  channel: string;
  sender: string;
  message_id: string;
  content: string;
  created_at: number;
}

// ── API Functions ─────────────────────────────────────────────────────────

export async function getAgents(): Promise<Record<string, AgentConfig>> {
  return apiFetch("/api/agents");
}

export async function getTeams(): Promise<Record<string, TeamConfig>> {
  return apiFetch("/api/teams");
}

export async function getSettings(): Promise<Settings> {
  return apiFetch("/api/settings");
}

export async function searchRegistrySkills(
  agentId: string,
  query: string
): Promise<{ results: { ref: string; installs?: string; url?: string }[]; raw?: string }> {
  const q = encodeURIComponent(query);
  return apiFetch(`/api/agents/${encodeURIComponent(agentId)}/skills/registry?query=${q}`);
}

export async function installRegistrySkill(
  agentId: string,
  ref: string
): Promise<{ ok: boolean; output: string }> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentId)}/skills/install`, {
    method: "POST",
    body: JSON.stringify({ ref }),
  });
}

export async function updateSettings(settings: Partial<Settings>): Promise<{ ok: boolean; settings: Settings }> {
  return apiFetch("/api/settings", { method: "PUT", body: JSON.stringify(settings) });
}

export async function runSetup(settings: Settings): Promise<{ ok: boolean; settings: Settings }> {
  return apiFetch("/api/setup", { method: "POST", body: JSON.stringify(settings) });
}

export async function applyServices(): Promise<{ ok: boolean; started: string[]; heartbeat: boolean; errors?: string[] }> {
  return apiFetch("/api/services/apply", { method: "POST" });
}

export async function getQueueStatus(): Promise<QueueStatus> {
  return apiFetch("/api/queue/status");
}

export async function getResponses(limit = 20): Promise<ResponseData[]> {
  return apiFetch(`/api/responses?limit=${limit}`);
}

export async function getLogs(limit = 100): Promise<{ lines: string[] }> {
  return apiFetch(`/api/logs?limit=${limit}`);
}

export async function saveAgent(
  id: string,
  agent: Partial<AgentConfig> & Pick<AgentConfig, "name" | "provider" | "model">
): Promise<{ ok: boolean; agent: AgentConfig }> {
  return apiFetch(`/api/agents/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(agent),
  });
}

export async function patchAgent(
  id: string,
  updates: Partial<AgentConfig>
): Promise<{ ok: boolean; agent: AgentConfig }> {
  return apiFetch(`/api/agents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function deleteAgent(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/agents/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function saveTeam(
  id: string,
  team: TeamConfig
): Promise<{ ok: boolean; team: TeamConfig }> {
  return apiFetch(`/api/teams/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(team),
  });
}

export async function deleteTeam(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/teams/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function sendMessage(payload: {
  message: string;
  agent?: string;
  sender?: string;
  channel?: string;
}): Promise<{ ok: boolean; messageId: string }> {
  return apiFetch("/api/message", { method: "POST", body: JSON.stringify(payload) });
}

export async function getAgentMessages(
  agentId: string,
  limit = 100,
  sinceId = 0
): Promise<AgentMessage[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    since_id: String(sinceId),
  });
  return apiFetch(`/api/agents/${encodeURIComponent(agentId)}/messages?${params.toString()}`);
}

// ── Agent Workspace Data ──────────────────────────────────────────────────

export interface WorkspaceSkill {
  id: string;
  name: string;
  description: string;
}

export interface AgentSkillsData {
  available: WorkspaceSkill[];
  assigned: string[];
}

export async function getAgentSkills(agentId: string): Promise<AgentSkillsData> {
  const data = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/skills`);
  // Normalise: handle legacy flat-array response gracefully
  if (Array.isArray(data)) return { available: data, assigned: data.map((s: WorkspaceSkill) => s.id) };
  return data as AgentSkillsData;
}

export async function updateAgentSkills(agentId: string, skills: string[]): Promise<{ ok: boolean; assigned: string[] }> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentId)}/skills`, {
    method: "PUT",
    body: JSON.stringify({ skills }),
  });
}

export async function getAgentSystemPrompt(agentId: string): Promise<{ content: string; path: string }> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentId)}/system-prompt`);
}

export async function saveAgentSystemPrompt(agentId: string, content: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentId)}/system-prompt`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export async function getAgentMemory(agentId: string): Promise<{ index: string; files: { name: string; path: string }[]; memoryDir: string }> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentId)}/memory`);
}

export async function getAgentHeartbeat(agentId: string): Promise<{ content: string; path: string; enabled: boolean; interval?: number }> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentId)}/heartbeat`);
}

export async function saveAgentHeartbeat(agentId: string, data: { content?: string; enabled?: boolean; interval?: number }): Promise<{ ok: boolean }> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentId)}/heartbeat`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ── Tasks ─────────────────────────────────────────────────────────────────

export type TaskStatus = "backlog" | "in_progress" | "review" | "done";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee: string;
  assigneeType: "agent" | "team" | "";
  projectId?: string;
  createdAt: number;
  updatedAt: number;
}

export async function getTasks(): Promise<Task[]> {
  return apiFetch("/api/tasks");
}

export async function createTask(task: Partial<Task>): Promise<{ ok: boolean; task: Task }> {
  return apiFetch("/api/tasks", { method: "POST", body: JSON.stringify(task) });
}

export async function updateTask(id: string, task: Partial<Task>): Promise<{ ok: boolean; task: Task }> {
  return apiFetch(`/api/tasks/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(task) });
}

export async function deleteTask(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function reorderTasks(columns: Record<string, string[]>): Promise<{ ok: boolean }> {
  return apiFetch("/api/tasks/reorder", { method: "PUT", body: JSON.stringify({ columns }) });
}

// ── Chat Room ────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: number;
  team_id: string;
  from_agent: string;
  message: string;
  created_at: number;
}

export async function getChatMessages(
  teamId: string,
  limit = 100,
  sinceId = 0
): Promise<ChatMessage[]> {
  return apiFetch(`/api/chatroom/${encodeURIComponent(teamId)}?limit=${limit}&since=${sinceId}`);
}

export async function postChatMessage(
  teamId: string,
  message: string
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/chatroom/${encodeURIComponent(teamId)}`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

// ── Projects ───────────────────────────────────────────────────────────

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

export interface Project {
  id: string;
  name: string;
  description: string;
  context_prompt?: string;
  status: "active" | "archived";
  skills?: string[];
  memory_enabled?: boolean;
  assigned_teams: ProjectTeam[];
  assigned_agents: ProjectAgent[];
  /** @deprecated legacy field — teams have their own working_directory now */
  working_directory?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BankSkill {
  id: string;
  name: string;
  description: string;
}

export async function getProjects(): Promise<Project[]> {
  return apiFetch("/api/projects");
}

export async function createProject(
  data: Partial<Omit<Project, "id" | "createdAt" | "updatedAt">> & Pick<Project, "name">
): Promise<{ ok: boolean; project: Project }> {
  return apiFetch("/api/projects", { method: "POST", body: JSON.stringify(data) });
}

export async function updateProject(
  id: string,
  data: Partial<Omit<Project, "id" | "createdAt">>
): Promise<{ ok: boolean; project: Project }> {
  return apiFetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function validateProjectDir(dirPath: string): Promise<{ exists: boolean }> {
  return apiFetch("/api/projects/validate-dir", {
    method: "POST",
    body: JSON.stringify({ path: dirPath }),
  });
}

// ── Schedules ─────────────────────────────────────────────────────────────

export interface Schedule {
  id: string;
  label: string;
  cron: string;
  agentId: string;
  message: string;
  channel: string;
  sender: string;
  enabled: boolean;
  createdAt: number;
  runAt?: string;
}

export async function getSchedules(agentId?: string): Promise<Schedule[]> {
  const params = agentId ? `?agent=${encodeURIComponent(agentId)}` : "";
  return apiFetch(`/api/schedules${params}`);
}

export async function createSchedule(data: {
  cron?: string;
  runAt?: string;
  agentId: string;
  message: string;
  label?: string;
  channel?: string;
  sender?: string;
}): Promise<{ ok: boolean; schedule: Schedule }> {
  return apiFetch("/api/schedules", { method: "POST", body: JSON.stringify(data) });
}

export async function updateSchedule(
  id: string,
  data: Partial<Omit<Schedule, "id" | "createdAt">>
): Promise<{ ok: boolean; schedule: Schedule }> {
  return apiFetch(`/api/schedules/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteSchedule(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ── Usage ─────────────────────────────────────────────────────────────────

export interface DailyUsage {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  total_tokens: number;
  message_count: number;
  cost_usd: number;
}

export interface UsageData {
  account: {
    subscriptionType: string;
    rateLimitTier: string;
  };
  rateLimit: {
    status: string;
    resetsAt: string;
    msUntilReset: number;
    rateLimitType: string;
    utilization: number | null;  // 0–1 actual session usage fraction from Claude
    overageStatus: string;
    isUsingOverage: boolean;
    fetchedAt: string;
  } | null;
  weekly: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    total_tokens: number;
    message_count: number;
    cost_usd: number;
    periodStart: string;
    periodEnd: string;        // next reset time (ISO)
    msElapsed: number;        // ms elapsed since weekly reset
    weeklyTokenBudget: number | null;
  };
  session: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    total_tokens: number;
    message_count: number;
    cost_usd: number;
    windowHours: number;
    windowStart: string;
    resetAt: string;
    msUntilReset: number;
  };
  daily: DailyUsage[];
  activeSessions: Array<{
    sessionId: string;
    project: string;
    startedAt: number;
  }>;
  totalFiles: number;
  totalProjects: number;
}

export async function getUsage(): Promise<UsageData> {
  return apiFetch("/api/usage");
}

export async function refreshRateLimit(): Promise<{ ok: boolean }> {
  return apiFetch("/api/usage/refresh-rate-limit", { method: "POST" });
}

// ── Models ────────────────────────────────────────────────────────────────

export async function getModels(): Promise<{
  models: ModelDefinition[];
  vendors: string[];
  byVendor: Record<string, ModelDefinition[]>;
}> {
  return apiFetch("/api/models");
}

// ── Sessions (Agent Tabs) ─────────────────────────────────────────────────

export async function getSessions(): Promise<SessionConfig[]> {
  return apiFetch("/api/sessions");
}

export async function getSession(id: string): Promise<SessionConfig> {
  return apiFetch(`/api/sessions/${encodeURIComponent(id)}`);
}

export async function createSession(data: {
  name?: string;
  provider: string;
  model: string;
  working_directory: string;
  permissions?: Partial<AgentPermissions>;
  skills?: string[];
  system_prompt?: string;
}): Promise<SessionConfig> {
  return apiFetch("/api/sessions", { method: "POST", body: JSON.stringify(data) });
}

export async function deleteSession(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ── Directories ───────────────────────────────────────────────────────────

export async function getDirectories(): Promise<string[]> {
  return apiFetch("/api/directories");
}

export async function addDirectory(dirPath: string): Promise<{ ok: boolean; directories: string[] }> {
  return apiFetch("/api/directories", { method: "POST", body: JSON.stringify({ path: dirPath }) });
}

export async function removeDirectory(dirPath: string): Promise<{ ok: boolean }> {
  return apiFetch("/api/directories", { method: "DELETE", body: JSON.stringify({ path: dirPath }) });
}

// ── Permissions ───────────────────────────────────────────────────────────

export async function getAgentPermissions(agentId: string): Promise<AgentPermissions> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentId)}/permissions`);
}

export async function updateAgentPermissions(
  agentId: string,
  permissions: AgentPermissions
): Promise<{ ok: boolean; permissions: AgentPermissions }> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentId)}/permissions`, {
    method: "PUT",
    body: JSON.stringify(permissions),
  });
}

// ── Clear History ─────────────────────────────────────────────────────────

export async function clearAgentHistory(agentId: string): Promise<{ ok: boolean; cleared: number }> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentId)}/clear-history`, { method: "POST" });
}

// ── SSE ───────────────────────────────────────────────────────────────────

// ── Blueprint Agents ──────────────────────────────────────────────────────

export async function getBlueprints(): Promise<BlueprintAgent[]> {
  return apiFetch("/api/blueprints");
}

export async function getBlueprint(id: string): Promise<BlueprintAgent> {
  return apiFetch(`/api/blueprints/${encodeURIComponent(id)}`);
}

export async function createBlueprint(
  data: Pick<BlueprintAgent, "name" | "provider" | "model"> & Partial<BlueprintAgent>
): Promise<{ ok: boolean; blueprint: BlueprintAgent }> {
  return apiFetch("/api/blueprints", { method: "POST", body: JSON.stringify(data) });
}

export async function updateBlueprint(
  id: string,
  data: Partial<Omit<BlueprintAgent, "id" | "created_at">>
): Promise<{ ok: boolean; blueprint: BlueprintAgent }> {
  return apiFetch(`/api/blueprints/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteBlueprint(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/blueprints/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getBlueprintSystemPrompt(id: string): Promise<{ system_prompt: string }> {
  return apiFetch(`/api/blueprints/${encodeURIComponent(id)}/system-prompt`);
}

export async function saveBlueprintSystemPrompt(id: string, system_prompt: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/blueprints/${encodeURIComponent(id)}/system-prompt`, {
    method: "PUT",
    body: JSON.stringify({ system_prompt }),
  });
}

export async function copyAgentToBlueprint(
  agent_id: string,
  name?: string
): Promise<{ ok: boolean; blueprint: BlueprintAgent }> {
  return apiFetch("/api/blueprints/copy-from-agent", {
    method: "POST",
    body: JSON.stringify({ agent_id, name }),
  });
}

// ── Skills Bank ───────────────────────────────────────────────────────────

export async function getSkillsBank(): Promise<BankSkill[]> {
  return apiFetch("/api/skills-bank");
}

export async function migrateSkillsBank(): Promise<{ ok: boolean; migrated: string[]; skipped: string[] }> {
  return apiFetch("/api/skills-bank/migrate", { method: "POST" });
}

// ── SSE ───────────────────────────────────────────────────────────────────

export function subscribeToEvents(
  onEvent: (event: EventData) => void,
  onError?: (err: Event) => void,
  eventTypes?: string[]
): () => void {
  const es = new EventSource(`${getApiBase()}/api/events/stream`);

  const handler = (e: MessageEvent) => {
    try { onEvent(JSON.parse(e.data)); } catch { /* ignore parse errors */ }
  };

  // Listen to all known event types
  const types = eventTypes ?? [
    "message_received", "agent_routed", "chain_step_start", "chain_step_done",
    "chain_handoff", "team_chain_start", "team_chain_end", "response_ready",
    "processor_start", "message_enqueued", "agent_message",
  ];
  for (const type of types) {
    es.addEventListener(type, handler);
  }

  if (onError) es.onerror = onError;

  return () => es.close();
}
