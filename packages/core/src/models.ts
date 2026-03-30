/**
 * Model Registry — catalog of all available models across vendors.
 *
 * Built-in models are pre-registered. Custom providers from settings.json
 * are auto-registered at query time, with async discovery from provider APIs.
 */

import { ModelDefinition, CustomProvider } from './types';
import { getSettings } from './config';

// ── Built-in models ─────────────────────────────────────────────────────────

const BUILTIN_MODELS: ModelDefinition[] = [
    // Anthropic
    {
        id: 'claude-sonnet-4-6',
        vendor: 'anthropic',
        display_name: 'Claude Sonnet 4.6',
        harness: 'claude',
        aliases: ['sonnet'],
        capabilities: {
            context_window: 200000,
            max_output_tokens: 16384,
            supports_tools: true,
            supports_vision: true,
            supports_streaming: true,
        },
    },
    {
        id: 'claude-opus-4-6',
        vendor: 'anthropic',
        display_name: 'Claude Opus 4.6',
        harness: 'claude',
        aliases: ['opus'],
        capabilities: {
            context_window: 200000,
            max_output_tokens: 32768,
            supports_tools: true,
            supports_vision: true,
            supports_streaming: true,
        },
    },
    {
        id: 'claude-haiku-4-5',
        vendor: 'anthropic',
        display_name: 'Claude Haiku 4.5',
        harness: 'claude',
        aliases: ['haiku'],
        capabilities: {
            context_window: 200000,
            max_output_tokens: 8192,
            supports_tools: true,
            supports_vision: true,
            supports_streaming: true,
        },
    },
    // Claude Code (special — same harness as claude but with code-agent defaults)
    {
        id: 'claude-code',
        vendor: 'anthropic',
        display_name: 'Claude Code',
        harness: 'claude-code',
        aliases: ['code', 'coder'],
        is_code_agent: true,
        capabilities: {
            context_window: 200000,
            max_output_tokens: 32768,
            supports_tools: true,
            supports_vision: true,
            supports_streaming: true,
        },
    },
    // OpenAI
    {
        id: 'gpt-5.2',
        vendor: 'openai',
        display_name: 'GPT-5.2',
        harness: 'codex',
        aliases: [],
        capabilities: {
            context_window: 128000,
            max_output_tokens: 16384,
            supports_tools: true,
            supports_vision: true,
            supports_streaming: true,
        },
    },
    {
        id: 'gpt-5.3-codex',
        vendor: 'openai',
        display_name: 'GPT-5.3 Codex',
        harness: 'codex',
        aliases: ['codex'],
        capabilities: {
            context_window: 128000,
            max_output_tokens: 16384,
            supports_tools: true,
            supports_vision: false,
            supports_streaming: true,
        },
    },
    // OpenCode variants
    {
        id: 'opencode/claude-sonnet-4-6',
        vendor: 'opencode',
        display_name: 'OpenCode Sonnet 4.6',
        harness: 'opencode',
        aliases: [],
        capabilities: {
            context_window: 200000,
            max_output_tokens: 16384,
            supports_tools: true,
            supports_vision: true,
            supports_streaming: true,
        },
    },
    {
        id: 'opencode/claude-opus-4-6',
        vendor: 'opencode',
        display_name: 'OpenCode Opus 4.6',
        harness: 'opencode',
        aliases: [],
        capabilities: {
            context_window: 200000,
            max_output_tokens: 32768,
            supports_tools: true,
            supports_vision: true,
            supports_streaming: true,
        },
    },
];

// ── Custom Provider Discovery ───────────────────────────────────────────────

/** Simple cache for async model discovery results */
let discoveryCache: { models: ModelDefinition[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Synchronous fallback: create one ModelDefinition per custom provider
 * using the single `model` field from settings.json.
 */
function getCustomProviderModelsFallback(): ModelDefinition[] {
    const settings = getSettings();
    const providers = settings.custom_providers || {};
    const models: ModelDefinition[] = [];

    for (const [providerId, provider] of Object.entries(providers)) {
        const p = provider as CustomProvider;
        if (!p.model) continue;

        models.push({
            id: p.model,
            vendor: `custom:${providerId}`,
            display_name: `${p.name} (${p.model})`,
            harness: p.harness as ModelDefinition['harness'],
            aliases: [],
            capabilities: {
                context_window: 0,
                supports_tools: p.harness !== 'native-openai' ? true : false,
                supports_vision: false,
                supports_streaming: true,
            },
        });
    }
    return models;
}

/**
 * Fetch models from a custom provider's discovery endpoint.
 * Expected endpoint: `{origin}/api/models` (not the /v1 base).
 */
async function fetchCustomProviderModels(
    providerId: string,
    provider: CustomProvider,
): Promise<ModelDefinition[]> {
    const origin = new URL(provider.base_url).origin; // e.g. http://localhost:8000
    const url = `${origin}/api/models`;

    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json() as Record<string, any>;

    const vendor = `custom:${providerId}`;
    const harness = provider.harness as ModelDefinition['harness'];
    const models: ModelDefinition[] = [];

    // Map local_installed
    if (Array.isArray(data.local_installed)) {
        for (const m of data.local_installed) {
            models.push({
                id: m.id,
                vendor,
                display_name: m.id,
                harness,
                aliases: [],
                capabilities: {
                    context_window: 0,
                    supports_tools: false,
                    supports_vision: false,
                    supports_streaming: true,
                },
                description: m.description || '',
                tier: m.tier || 'general',
                vram_gb: m.vram_gb,
                installed: m.installed ?? true,
                category: 'local_installed',
            });
        }
    }

    // Map local_recommended
    if (Array.isArray(data.local_recommended)) {
        for (const m of data.local_recommended) {
            models.push({
                id: m.id,
                vendor,
                display_name: m.id,
                harness,
                aliases: [],
                capabilities: {
                    context_window: 0,
                    supports_tools: false,
                    supports_vision: false,
                    supports_streaming: true,
                },
                description: m.description || '',
                tier: m.tier || 'general',
                vram_gb: m.vram_gb,
                installed: m.installed ?? false,
                category: 'local_recommended',
                pull_cmd: m.pull_cmd,
            });
        }
    }

    // Map cloud
    if (Array.isArray(data.cloud)) {
        for (const m of data.cloud) {
            models.push({
                id: m.id,
                vendor,
                display_name: m.id,
                harness,
                aliases: [],
                capabilities: {
                    context_window: 0,
                    supports_tools: true,
                    supports_vision: true,
                    supports_streaming: true,
                },
                description: m.description || '',
                tier: m.tier || 'cloud',
                available: m.available ?? false,
                category: 'cloud',
            });
        }
    }

    return models;
}

/**
 * Fetch models from all custom providers asynchronously.
 * Falls back to synchronous single-model per provider on failure.
 */
async function discoverCustomProviderModels(): Promise<ModelDefinition[]> {
    const settings = getSettings();
    const providers = settings.custom_providers || {};
    const all: ModelDefinition[] = [];

    for (const [providerId, provider] of Object.entries(providers)) {
        const p = provider as CustomProvider;
        try {
            const discovered = await fetchCustomProviderModels(providerId, p);
            all.push(...discovered);
        } catch {
            // Fallback to single-model entry
            if (p.model) {
                all.push({
                    id: p.model,
                    vendor: `custom:${providerId}`,
                    display_name: `${p.name} (${p.model})`,
                    harness: p.harness as ModelDefinition['harness'],
                    aliases: [],
                    capabilities: {
                        context_window: 0,
                        supports_tools: p.harness !== 'native-openai' ? true : false,
                        supports_vision: false,
                        supports_streaming: true,
                    },
                });
            }
        }
    }

    return all;
}

// ── Vendor filtering ────────────────────────────────────────────────────────

/**
 * Return only built-in models whose vendor has an auth token configured.
 * Vendors without tokens are excluded so users never see unusable models.
 */
function getConfiguredBuiltinModels(): ModelDefinition[] {
    const settings = getSettings();
    const models = settings.models as Record<string, any> | undefined;
    const configured = new Set<string>();

    // Anthropic: needs auth_token (from CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY)
    if (models?.anthropic?.auth_token) configured.add('anthropic');
    // OpenAI: needs auth_token (from OPENAI_API_KEY)
    if (models?.openai?.auth_token) configured.add('openai');
    // OpenCode: needs auth_token
    if (models?.opencode?.auth_token) configured.add('opencode');

    return BUILTIN_MODELS.filter(m => configured.has(m.vendor));
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Get all available models (sync): configured built-in + fallback custom models.
 */
export function getModelRegistry(): ModelDefinition[] {
    return [...getConfiguredBuiltinModels(), ...getCustomProviderModelsFallback()];
}

/**
 * Get all available models (async): configured built-in + discovered custom models.
 * Uses 30-second cache to avoid hammering provider APIs.
 */
export async function getModelRegistryAsync(): Promise<ModelDefinition[]> {
    const now = Date.now();
    if (discoveryCache && now - discoveryCache.timestamp < CACHE_TTL_MS) {
        return [...getConfiguredBuiltinModels(), ...discoveryCache.models];
    }
    const customModels = await discoverCustomProviderModels();
    discoveryCache = { models: customModels, timestamp: now };
    return [...getConfiguredBuiltinModels(), ...customModels];
}

/**
 * Get models grouped by vendor (sync fallback).
 */
export function getModelsByVendor(): Record<string, ModelDefinition[]> {
    return groupByVendor(getModelRegistry());
}

/**
 * Get models grouped by vendor (async with discovery).
 */
export async function getModelsByVendorAsync(): Promise<Record<string, ModelDefinition[]>> {
    return groupByVendor(await getModelRegistryAsync());
}

/**
 * Get unique vendor list (async).
 */
export async function getVendorsAsync(): Promise<string[]> {
    const models = await getModelRegistryAsync();
    return [...new Set(models.map(m => m.vendor))];
}

function groupByVendor(models: ModelDefinition[]): Record<string, ModelDefinition[]> {
    const grouped: Record<string, ModelDefinition[]> = {};
    for (const model of models) {
        if (!grouped[model.vendor]) grouped[model.vendor] = [];
        grouped[model.vendor].push(model);
    }
    return grouped;
}

/**
 * Find a model by ID or alias.
 */
export function findModel(idOrAlias: string): ModelDefinition | undefined {
    const models = getModelRegistry();
    return models.find(m => m.id === idOrAlias || m.aliases.includes(idOrAlias));
}

/**
 * Get the list of unique vendors (sync).
 */
export function getVendors(): string[] {
    const models = getModelRegistry();
    return [...new Set(models.map(m => m.vendor))];
}
