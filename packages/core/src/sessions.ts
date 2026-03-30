/**
 * Session Manager — lifecycle management for session/agent tabs.
 *
 * Sessions are ephemeral agents stored in SQLite (not settings.json).
 * Each session has its own model, directory, permissions, and chat history.
 */

import path from 'path';
import crypto from 'crypto';
import { SessionConfig, AgentConfig, AgentPermissions, DEFAULT_PERMISSIONS } from './types';
import { getSettings } from './config';
import { ensureAgentDirectory, syncAgentSkills } from './agent';
import {
    insertSession, getActiveSessions, getSession as getSessionRow,
    destroySession as destroySessionRow, clearAgentHistory, updateSessionActivity,
} from './queues';
import { log } from './logging';
import fs from 'fs';

function generateSessionId(): string {
    return `session_${crypto.randomBytes(6).toString('hex')}`;
}

export interface CreateSessionInput {
    name?: string;
    provider: string;
    model: string;
    working_directory: string;
    permissions?: Partial<AgentPermissions>;
    skills?: string[];
    system_prompt?: string;
}

/**
 * Create a new session agent tab.
 */
export function createSession(input: CreateSessionInput): SessionConfig {
    const id = generateSessionId();
    const now = Date.now();

    const permissions: AgentPermissions = {
        ...DEFAULT_PERMISSIONS,
        ...(input.permissions || {}),
    };

    const session: SessionConfig = {
        id,
        name: input.name || `${input.model} session`,
        provider: input.provider,
        model: input.model,
        working_directory: input.working_directory,
        permissions,
        skills: input.skills,
        system_prompt: input.system_prompt,
        created_at: now,
        last_active_at: now,
    };

    // Provision workspace directory
    const settings = getSettings();
    const workspacePath = settings.workspace?.path
        || path.join(require('os').homedir(), 'tinyagi-workspace');
    const skillsDir = path.join(workspacePath, 'skills');
    const agentDir = path.isAbsolute(input.working_directory)
        ? input.working_directory
        : path.join(workspacePath, id);

    // Update working_directory to absolute path
    session.working_directory = agentDir;

    try {
        ensureAgentDirectory(agentDir, skillsDir, input.skills ?? null);
    } catch (err) {
        log('ERROR', `[Sessions] Failed to provision session ${id}: ${(err as Error).message}`);
    }

    // Write system prompt if provided
    if (input.system_prompt) {
        fs.writeFileSync(path.join(agentDir, 'AGENTS.md'), input.system_prompt, 'utf8');
    }

    // Store in SQLite
    insertSession(id, session.name, JSON.stringify(session));

    log('INFO', `[Sessions] Created session '${id}' (${session.name})`);
    return session;
}

/**
 * List all active sessions.
 */
export function listSessions(): SessionConfig[] {
    const rows = getActiveSessions();
    return rows.map((r: any) => JSON.parse(r.config) as SessionConfig);
}

/**
 * Get a single session by ID.
 */
export function getSessionById(id: string): SessionConfig | null {
    const row = getSessionRow(id);
    if (!row || row.status !== 'active') return null;
    return JSON.parse(row.config) as SessionConfig;
}

/**
 * Destroy a session — marks as destroyed, clears chat history.
 */
export function deleteSession(id: string): boolean {
    const session = getSessionById(id);
    if (!session) return false;

    // Clear chat history
    clearAgentHistory(id);

    // Mark destroyed in DB
    destroySessionRow(id);

    log('INFO', `[Sessions] Destroyed session '${id}'`);
    return true;
}

/**
 * Touch session activity timestamp.
 */
export function touchSession(id: string): void {
    updateSessionActivity(id);
}

/**
 * Convert a session to an AgentConfig for use by the queue processor.
 */
export function sessionToAgentConfig(session: SessionConfig): AgentConfig {
    return {
        name: session.name,
        provider: session.provider,
        model: session.model,
        working_directory: session.working_directory,
        skills: session.skills,
        permissions: session.permissions,
    };
}

/**
 * Get all agents: persistent (from settings.json) + active sessions (from SQLite).
 * Used by the queue processor to resolve all routable agents.
 */
export function getAllAgents(): Record<string, AgentConfig> {
    const settings = getSettings();
    const persistent: Record<string, AgentConfig> = settings.agents && Object.keys(settings.agents).length > 0
        ? { ...settings.agents }
        : { default: require('./config').getDefaultAgentFromModels(settings) };

    // Merge active sessions
    const sessions = listSessions();
    for (const session of sessions) {
        persistent[session.id] = sessionToAgentConfig(session);
    }

    return persistent;
}
