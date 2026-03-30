/**
 * Permission resolution and enforcement helpers.
 *
 * Used by invoke.ts to map AgentPermissions into CLI flags
 * and skill filtering.
 */

import { AgentPermissions, AgentConfig, DEFAULT_PERMISSIONS } from './types';

/**
 * Get effective permissions for an agent, falling back to defaults.
 */
export function resolvePermissions(agent: AgentConfig): AgentPermissions {
    return {
        ...DEFAULT_PERMISSIONS,
        ...(agent.permissions || {}),
    };
}

/**
 * Build CLI flag overrides based on permissions.
 * Returns an object of flags to apply/omit when spawning the agent.
 */
export function getPermissionFlags(permissions: AgentPermissions): {
    skipSandbox: boolean;    // whether to pass --dangerously-skip-permissions
    readOnly: boolean;       // whether to pass read-only flags
    noFilesystem: boolean;   // whether to skip working dir mount
} {
    return {
        skipSandbox: permissions.sandbox_mode === 'full',
        readOnly: permissions.filesystem === 'read',
        noFilesystem: permissions.filesystem === 'none',
    };
}

/**
 * Filter skills based on permission settings.
 * Returns the effective skills list after applying permission constraints.
 */
export function filterSkillsByPermissions(
    assignedSkills: string[] | null | undefined,
    permissions: AgentPermissions,
): string[] | null {
    // If permissions say 'none', no skills
    if (permissions.skills === 'none') return [];

    // If permissions say 'all', use assigned skills as-is
    if (permissions.skills === 'all') return assignedSkills ?? null;

    // Specific skills list from permissions — intersect with assigned
    if (Array.isArray(permissions.skills)) {
        if (!assignedSkills) return permissions.skills;
        return assignedSkills.filter(s => (permissions.skills as string[]).includes(s));
    }

    return assignedSkills ?? null;
}
