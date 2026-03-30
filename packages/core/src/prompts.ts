/**
 * Prompt Assembly — builds the layered system prompt for an agent at runtime.
 *
 * Chain (top to bottom):
 *   1. Project context (context_prompt + team's role in project)
 *   2. Team context (team_prompt + agent's role in team)
 *   3. Agent identity (blueprint system prompt)
 *
 * Each layer is optional; missing layers are skipped gracefully.
 */

import { getBlueprint, getBlueprintSystemPrompt } from './blueprints';
import { getSettings } from './config';
import { migrateTeamConfig } from './config';
import path from 'path';
import fs from 'fs';
import { TINYAGI_HOME } from './config';

const PROJECTS_FILE = path.join(TINYAGI_HOME, 'projects.json');

function readProjects(): Record<string, unknown>[] {
    try {
        if (!fs.existsSync(PROJECTS_FILE)) return [];
        return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    } catch {
        return [];
    }
}

/**
 * Assemble the full layered system prompt for an agent.
 *
 * @param agentId  - Blueprint Agent ID (or Task Agent ID for standalone use)
 * @param teamId   - Team ID (from settings.json), optional
 * @param projectId - Project ID (from projects.json), optional
 * @returns The assembled system prompt string, ready to send to the LLM.
 */
export async function assembleSystemPrompt(
    agentId: string,
    teamId?: string,
    projectId?: string,
): Promise<string> {
    const sections: string[] = [];

    // ── 1. Project context ──
    if (projectId) {
        const projects = readProjects();
        const project = projects.find((p: Record<string, unknown>) => p.id === projectId) as Record<string, unknown> | undefined;
        if (project) {
            if (project.context_prompt) {
                sections.push(`# Project: ${project.name}\n${project.context_prompt}`);
            }
            // Team's role in project
            if (teamId && Array.isArray(project.assigned_teams)) {
                const pt = (project.assigned_teams as Array<{ team_id: string; role_tag: string; role_description?: string }>)
                    .find(t => t.team_id === teamId);
                if (pt?.role_description) {
                    sections.push(`# Team Role in Project: ${pt.role_tag}\n${pt.role_description}`);
                } else if (pt?.role_tag) {
                    sections.push(`# Team Role in Project\nRole: ${pt.role_tag}`);
                }
            }
            // Standalone agent's role in project
            if (!teamId && Array.isArray(project.assigned_agents)) {
                const pa = (project.assigned_agents as Array<{ agent_id: string; role_tag?: string; role_description?: string }>)
                    .find(a => a.agent_id === agentId);
                if (pa?.role_description) {
                    sections.push(`# Agent Role in Project: ${pa.role_tag}\n${pa.role_description}`);
                } else if (pa?.role_tag) {
                    sections.push(`# Agent Role in Project\nRole: ${pa.role_tag}`);
                }
            }
        }
    }

    // ── 2. Team context ──
    if (teamId) {
        const settings = getSettings();
        const rawTeams = settings.teams || {};
        const rawTeam = rawTeams[teamId] as unknown as Record<string, unknown> | undefined;
        if (rawTeam) {
            const team = migrateTeamConfig(rawTeam);
            if (team.team_prompt) {
                sections.push(`# Team: ${team.name}\n${team.team_prompt}`);
            }
            const member = team.members.find(m => m.agent_id === agentId);
            if (member?.role_prompt) {
                sections.push(`# Your Role: ${member.role_tag}\n${member.role_prompt}`);
            } else if (member?.role_tag) {
                sections.push(`# Your Role\n${member.role_tag}`);
            }
        }
    }

    // ── 3. Agent identity ──
    const blueprint = getBlueprint(agentId);
    if (blueprint) {
        const systemPrompt = getBlueprintSystemPrompt(agentId);
        if (systemPrompt.trim()) {
            sections.push(`# Agent Identity\n${systemPrompt.trim()}`);
        }
    } else {
        // Fallback: Task Agent system prompt from settings
        const settings = getSettings();
        const taskAgent = settings.agents?.[agentId];
        if (taskAgent?.system_prompt?.trim()) {
            sections.push(`# Agent Identity\n${taskAgent.system_prompt.trim()}`);
        }
    }

    return sections.join('\n\n---\n\n');
}
