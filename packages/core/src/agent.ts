import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AgentConfig, TeamConfig } from './types';
import { SCRIPT_DIR } from './config';
import { loadMemoryIndex } from './memory';
import { log } from './logging';

/**
 * Built-in agent instructions read from the AGENTS.md template at SCRIPT_DIR.
 * Teammate markers are replaced at runtime by buildSystemPrompt().
 */
export const BUILTIN_AGENT_INSTRUCTIONS = fs.readFileSync(path.join(SCRIPT_DIR, 'AGENTS.md'), 'utf8');
const BUILTIN_AGENT_INSTRUCTIONS_HASH = crypto
    .createHash('sha256')
    .update(BUILTIN_AGENT_INSTRUCTIONS)
    .digest('hex');

type PromptCacheEntry = { hash: string; prompt: string };
const systemPromptCache = new Map<string, PromptCacheEntry>();

function hashString(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Recursively copy directory
 */
export function copyDirSync(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * Seed the shared workspace/skills/ library from SCRIPT_DIR/.agents/skills/ (never
 * overwrites existing skills), then wire the agent's .claude/skills/ directory so it
 * contains only symlinks for the assigned skills.
 *
 * Skills are sourced from (highest priority first):
 *   1. skills-bank/ directory (if provided)
 *   2. workspace/skills/ directory
 *   3. SCRIPT_DIR/.agents/skills/ (built-in defaults seeded into workspace/skills/)
 *
 * @param agentDir           Absolute path to the agent working directory.
 * @param workspaceSkillsDir Absolute path to workspace/skills/ (shared library).
 * @param assignedSkills     Skill IDs to enable.  undefined / null = enable all.
 * @param skillsBankDir      Optional path to ~/.tinyagi/skills-bank/ to supplement workspace skills.
 */
export function syncAgentSkills(
    agentDir: string,
    workspaceSkillsDir: string,
    assignedSkills?: string[] | null,
    skillsBankDir?: string,
): void {
    const sourceSkills = path.join(SCRIPT_DIR, '.agents', 'skills');

    // Seed workspace/skills/ — only add skills that are not already there
    if (fs.existsSync(sourceSkills)) {
        fs.mkdirSync(workspaceSkillsDir, { recursive: true });
        for (const entry of fs.readdirSync(sourceSkills, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const dest = path.join(workspaceSkillsDir, entry.name);
            if (!fs.existsSync(dest)) {
                copyDirSync(path.join(sourceSkills, entry.name), dest);
            }
        }
    }

    // Remove legacy per-agent .agents/ directory (no longer needed)
    const legacyAgentsDir = path.join(agentDir, '.agents');
    if (fs.existsSync(legacyAgentsDir)) {
        fs.rmSync(legacyAgentsDir, { recursive: true, force: true });
    }

    // .claude/skills/ must be a real directory (not a symlink)
    const claudeSkillsDir = path.join(agentDir, '.claude', 'skills');
    fs.mkdirSync(path.join(agentDir, '.claude'), { recursive: true });

    try {
        const lstat = fs.lstatSync(claudeSkillsDir);
        if (lstat.isSymbolicLink()) fs.unlinkSync(claudeSkillsDir);
    } catch { /* doesn't exist */ }

    fs.mkdirSync(claudeSkillsDir, { recursive: true });

    // Build a combined map of skillId → source directory
    // workspace/skills takes precedence over bank for same ID
    const skillSources = new Map<string, string>();

    // Add skills from bank first (lower priority)
    if (skillsBankDir && fs.existsSync(skillsBankDir)) {
        for (const entry of fs.readdirSync(skillsBankDir, { withFileTypes: true })) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                skillSources.set(entry.name, path.join(skillsBankDir, entry.name));
            }
        }
    }

    // Add workspace skills (overwrite any same-ID bank entries)
    if (fs.existsSync(workspaceSkillsDir)) {
        for (const entry of fs.readdirSync(workspaceSkillsDir, { withFileTypes: true })) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                skillSources.set(entry.name, path.join(workspaceSkillsDir, entry.name));
            }
        }
    }

    const available = [...skillSources.keys()];
    const toAssign = assignedSkills ?? available;

    // Remove stale symlinks for skills no longer assigned
    for (const entry of fs.readdirSync(claudeSkillsDir, { withFileTypes: true })) {
        if (!toAssign.includes(entry.name)) {
            fs.rmSync(path.join(claudeSkillsDir, entry.name), { recursive: true, force: true });
        }
    }

    // Create / update symlinks for assigned skills
    for (const skillId of toAssign) {
        const skillSource = skillSources.get(skillId);
        if (!skillSource || !fs.existsSync(skillSource)) continue;

        const symlinkPath = path.join(claudeSkillsDir, skillId);
        const relTarget = path.relative(claudeSkillsDir, skillSource);

        try {
            const lstat = fs.lstatSync(symlinkPath);
            if (lstat.isSymbolicLink() && fs.readlinkSync(symlinkPath) === relTarget) continue;
            fs.rmSync(symlinkPath, { recursive: true, force: true });
        } catch { /* doesn't exist */ }

        fs.symlinkSync(relTarget, symlinkPath);
    }
}

/**
 * Ensure agent directory exists with template files from SCRIPT_DIR.
 * Safe to call on existing directories — will sync skills on every call.
 *
 * @param agentDir           Absolute path to the agent working directory.
 * @param workspaceSkillsDir Path to workspace/skills/ shared library.  When
 *                           provided, skills are synced; omit to skip skill setup.
 * @param assignedSkills     Skill IDs to enable.  undefined = all available.
 * @param skillsBankDir      Optional path to ~/.tinyagi/skills-bank/ to supplement workspace skills.
 */
export function ensureAgentDirectory(
    agentDir: string,
    workspaceSkillsDir?: string,
    assignedSkills?: string[] | null,
    skillsBankDir?: string,
): void {
    const isNew = !fs.existsSync(agentDir);
    fs.mkdirSync(agentDir, { recursive: true });

    if (isNew) {
        // Copy .claude directory (skills will be overwritten by syncAgentSkills below)
        const sourceClaudeDir = path.join(SCRIPT_DIR, '.claude');
        if (fs.existsSync(sourceClaudeDir)) {
            copyDirSync(sourceClaudeDir, path.join(agentDir, '.claude'));
        }

        // Copy heartbeat.md
        const sourceHeartbeat = path.join(SCRIPT_DIR, 'heartbeat.md');
        if (fs.existsSync(sourceHeartbeat)) {
            fs.copyFileSync(sourceHeartbeat, path.join(agentDir, 'heartbeat.md'));
        }

        // Create empty AGENTS.md for user customization
        fs.writeFileSync(path.join(agentDir, 'AGENTS.md'), '');

        // Create .tinyagi directory and copy SOUL.md
        const targetTinyagi = path.join(agentDir, '.tinyagi');
        fs.mkdirSync(targetTinyagi, { recursive: true });
        const sourceSoul = path.join(SCRIPT_DIR, 'SOUL.md');
        if (fs.existsSync(sourceSoul)) {
            fs.copyFileSync(sourceSoul, path.join(targetTinyagi, 'SOUL.md'));
        }
    }

    // Create memory directory for hierarchical memory system
    fs.mkdirSync(path.join(agentDir, 'memory'), { recursive: true });

    // Sync skills if a shared library path was provided
    if (workspaceSkillsDir) {
        syncAgentSkills(agentDir, workspaceSkillsDir, assignedSkills, skillsBankDir);
    }
}

/**
 * Build the full system prompt for an agent invocation.
 * Combines built-in instructions + teammate info + user's custom AGENTS.md + config system prompt.
 */
export function buildSystemPrompt(
    agentId: string,
    agentDir: string,
    agents: Record<string, AgentConfig>,
    teams: Record<string, TeamConfig>,
    configSystemPrompt?: string,
    configPromptFile?: string
): string {
    let prompt = BUILTIN_AGENT_INSTRUCTIONS;

    // Build teammate block
    const startMarker = '<!-- TEAMMATES_START -->';
    const endMarker = '<!-- TEAMMATES_END -->';

    // Collect teams this agent belongs to (supports both legacy agents[] and new members[])
    const agentTeams: { teamId: string; teamName: string; leaderId: string; members: { id: string; name: string; model: string }[] }[] = [];
    for (const [teamId, team] of Object.entries(teams)) {
        // New format: members[]
        const memberIds: string[] = Array.isArray(team.members)
            ? team.members.map((m: { agent_id: string }) => m.agent_id)
            : ((team as unknown as { agents?: string[] }).agents || []);

        if (!memberIds.includes(agentId)) continue;
        const members: { id: string; name: string; model: string }[] = [];
        for (const tid of memberIds) {
            if (tid === agentId) continue;
            const agent = agents[tid];
            if (agent) {
                members.push({ id: tid, name: agent.name, model: agent.model });
            }
        }
        agentTeams.push({ teamId, teamName: team.name, leaderId: team.leader_agent, members });
    }

    let block = '';
    const self = agents[agentId];
    const isLeaderOfAny = agentTeams.some(t => t.leaderId === agentId);
    if (self) {
        const leaderTag = isLeaderOfAny ? ' *(team leader)*' : '';
        block += `\n### You\n\n- \`@${agentId}\` — **${self.name}** (${self.model})${leaderTag}\n`;
    }
    if (agentTeams.length > 0) {
        for (const team of agentTeams) {
            block += `\n### Team \`#${team.teamId}\` — ${team.teamName}\n\n`;
            for (const t of team.members) {
                const leaderTag = t.id === team.leaderId ? ' *(team leader)*' : '';
                block += `- \`@${t.id}\` — **${t.name}** (${t.model})${leaderTag}\n`;
            }
        }
    }

    // Inject teammate block into the built-in instructions
    const startIdx = prompt.indexOf(startMarker);
    const endIdx = prompt.indexOf(endMarker);
    if (startIdx !== -1 && endIdx !== -1) {
        prompt = prompt.substring(0, startIdx + startMarker.length) + block + prompt.substring(endIdx);
    }

    // Inject memory index into the system prompt
    const memStartMarker = '<!-- MEMORY_START -->';
    const memEndMarker = '<!-- MEMORY_END -->';
    const memoryTree = loadMemoryIndex(agentDir);
    let memBlock = '';
    if (memoryTree) {
        memBlock = '\n' + memoryTree + '\n\n' +
            'To read a memory in detail, read the file at `memory/<path>`. ' +
            'Use the **memory** skill to create, update, or reorganize memories.\n';
    } else {
        memBlock = '\nNo memories yet. Use the **memory** skill to start building your memory.\n';
    }
    const memStartIdx = prompt.indexOf(memStartMarker);
    const memEndIdx = prompt.indexOf(memEndMarker);
    if (memStartIdx !== -1 && memEndIdx !== -1) {
        prompt = prompt.substring(0, memStartIdx + memStartMarker.length) + memBlock + prompt.substring(memEndIdx);
    }

    // Inject available skills list — read SKILL.md files from .claude/skills/
    const claudeSkillsDir = path.join(agentDir, '.claude', 'skills');
    let skillsBlock = '';
    if (fs.existsSync(claudeSkillsDir)) {
        const skillEntries: { name: string; description: string }[] = [];
        try {
            for (const entry of fs.readdirSync(claudeSkillsDir, { withFileTypes: true })) {
                if (entry.name.startsWith('.')) continue;
                // Resolve through symlinks
                const skillDir = path.join(claudeSkillsDir, entry.name);
                const skillMd = path.join(skillDir, 'SKILL.md');
                let skillName = entry.name;
                let skillDesc = '';
                if (fs.existsSync(skillMd)) {
                    try {
                        const content = fs.readFileSync(skillMd, 'utf8');
                        const fm = content.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] || '';
                        const nameMatch = fm.match(/^name:\s*["']?(.+?)["']?\s*$/m);
                        const descMatch = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m);
                        if (nameMatch) skillName = nameMatch[1];
                        if (descMatch) skillDesc = descMatch[1];
                    } catch { /* skip */ }
                }
                skillEntries.push({ name: skillName, description: skillDesc });
            }
        } catch { /* skip */ }
        if (skillEntries.length > 0) {
            skillsBlock = '\n\n## Your Skills\n\n' +
                skillEntries.map(s => `- **${s.name}**${s.description ? ': ' + s.description : ''}`).join('\n');
        }
    }
    // Prepend skills to the system prompt so small models see them early
    if (skillsBlock) prompt = skillsBlock.trimStart() + '\n\n' + prompt;

    // Append user's custom AGENTS.md from agent workspace (if non-empty)
    const userAgentsMd = path.join(agentDir, 'AGENTS.md');
    let userContent = '';
    if (fs.existsSync(userAgentsMd)) {
        userContent = fs.readFileSync(userAgentsMd, 'utf8').trim();
        if (userContent) {
            prompt += '\n\n' + userContent;
        }
    }

    // Append config system prompt (from settings.json)
    let promptFileContent = '';
    if (configPromptFile) {
        try {
            promptFileContent = fs.readFileSync(configPromptFile, 'utf8').trim();
            if (promptFileContent) {
                prompt += '\n\n' + promptFileContent;
            }
        } catch {
            // Ignore missing prompt file
        }
    } else if (configSystemPrompt) {
        prompt += '\n\n' + configSystemPrompt;
    }

    const cacheInput = JSON.stringify({
        agentId,
        builtin: BUILTIN_AGENT_INSTRUCTIONS_HASH,
        teammateBlock: block,
        memoryTree,
        skillsBlock,
        userContent,
        promptFileContent,
        configSystemPrompt: configSystemPrompt || '',
    });
    const cacheHash = hashString(cacheInput);
    const cached = systemPromptCache.get(agentId);
    if (!cached || cached.hash !== cacheHash) {
        log('DEBUG', `System prompt cache updated for agent: ${agentId}`);
        systemPromptCache.set(agentId, { hash: cacheHash, prompt });
    } else {
        return cached.prompt;
    }

    return prompt;
}
