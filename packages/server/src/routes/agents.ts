import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Hono } from 'hono';
import { AgentConfig, CustomProvider } from '@tinyagi/core';
import { getSettings, getAgents, ensureAgentDirectory, syncAgentSkills, getSkillsBankDir } from '@tinyagi/core';
import { log } from '@tinyagi/core';
import { mutateSettings } from './settings';

const app = new Hono();
const execFileAsync = promisify(execFile);

async function ensureSkillsCli(cwd: string) {
    try {
        await execFileAsync('npx', ['--yes', 'skills', '--version'], {
            cwd,
            env: { ...process.env, CI: '1' },
            timeout: 60_000,
            maxBuffer: 1024 * 1024,
        });
    } catch {
        // Best-effort: running any command will install the CLI if missing.
    }
}

async function runSkills(args: string[], cwd: string): Promise<string> {
    const { stdout, stderr } = await execFileAsync('npx', ['--yes', 'skills', ...args], {
        cwd,
        env: { ...process.env, CI: '1' },
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
    });
    return `${stdout}${stderr ? `\n${stderr}` : ''}`.trim();
}
// ── Shared helpers ─────────────────────────────────────────────────────────────

function getWorkspacePaths(settings: ReturnType<typeof getSettings>) {
    const workspacePath = settings.workspace?.path
        || require('path').join(require('os').homedir(), 'tinyagi-workspace');
    return {
        workspacePath,
        skillsDir: require('path').join(workspacePath, 'skills'),
    };
}

function resolveAgentDir(settings: ReturnType<typeof getSettings>, workingDirectory: string): string {
    const { workspacePath } = getWorkspacePaths(settings);
    return path.isAbsolute(workingDirectory)
        ? workingDirectory
        : path.join(workspacePath, workingDirectory);
}

function readSkillsFromDir(dir: string): { id: string; name: string; description: string }[] {
    const skills: { id: string; name: string; description: string }[] = [];
    if (!fs.existsSync(dir)) return skills;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const skillMd = path.join(dir, entry.name, 'SKILL.md');
        let name = entry.name;
        let description = '';
        if (fs.existsSync(skillMd)) {
            try {
                const content = fs.readFileSync(skillMd, 'utf8');
                const fm = content.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] || '';
                const nameMatch = fm.match(/^name:\s*["']?(.+?)["']?\s*$/m);
                const descMatch = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m);
                if (nameMatch) name = nameMatch[1];
                if (descMatch) description = descMatch[1];
            } catch { /* skip */ }
        }
        skills.push({ id: entry.name, name, description });
    }
    return skills;
}

// GET /api/skills — list all skills: workspace/skills/ merged with skills-bank/
app.get('/api/skills', (c) => {
    const { skillsDir } = getWorkspacePaths(getSettings());
    const bankDir = getSkillsBankDir();
    // Merge: workspace takes precedence for same ID
    const bankSkills = readSkillsFromDir(bankDir);
    const wsSkills = readSkillsFromDir(skillsDir);
    const merged = new Map(bankSkills.map(s => [s.id, s]));
    for (const s of wsSkills) merged.set(s.id, s);
    return c.json([...merged.values()]);
});

// GET /api/agents
app.get('/api/agents', (c) => {
    return c.json(getAgents(getSettings()));
});

// PUT /api/agents/:id
app.put('/api/agents/:id', async (c) => {
    const agentId = c.req.param('id');
    const body = await c.req.json() as Partial<AgentConfig>;
    if (!body.name || !body.provider || !body.model) {
        return c.json({ error: 'name, provider, and model are required' }, 400);
    }

    const currentSettings = getSettings();
    const isNew = !currentSettings.agents?.[agentId];

    const workspacePath = currentSettings.workspace?.path
        || path.join(require('os').homedir(), 'tinyagi-workspace');
    const workingDir = body.working_directory || path.join(workspacePath, agentId);

    const settings = mutateSettings(s => {
        if (!s.agents) s.agents = {};
        s.agents[agentId] = {
            name: body.name!,
            provider: body.provider!,
            model: body.model!,
            working_directory: workingDir,
            ...(body.prompt_file ? { prompt_file: body.prompt_file } : {}),
        };
    });

    if (isNew) {
        try {
            const { skillsDir } = getWorkspacePaths(currentSettings);
            ensureAgentDirectory(workingDir, skillsDir, (body as any).skills ?? null);
            log('INFO', `[API] Agent '${agentId}' provisioned at ${workingDir}`);
        } catch (err) {
            log('ERROR', `[API] Agent '${agentId}' provisioning failed: ${(err as Error).message}`);
        }
    }

    if (body.system_prompt != null) {
        fs.writeFileSync(path.join(workingDir, 'AGENTS.md'), body.system_prompt, 'utf8');
    }

    log('INFO', `[API] Agent '${agentId}' saved`);
    return c.json({
        ok: true,
        agent: settings.agents![agentId],
        provisioned: isNew,
    });
});

// PATCH /api/agents/:id — partial update (e.g. change model without losing skills/heartbeat)
app.patch('/api/agents/:id', async (c) => {
    const agentId = c.req.param('id');
    const settings = getSettings();
    const agent = settings.agents?.[agentId];
    if (!agent) return c.json({ error: `agent '${agentId}' not found` }, 404);

    const body = await c.req.json() as Partial<AgentConfig>;
    const updated = mutateSettings(s => {
        if (!s.agents?.[agentId]) return;
        const a = s.agents[agentId];
        if (body.name != null) a.name = body.name;
        if (body.provider != null) a.provider = body.provider;
        if (body.model != null) a.model = body.model;
        if (body.working_directory != null) a.working_directory = body.working_directory;
        if (body.system_prompt != null) a.system_prompt = body.system_prompt;
        if (body.prompt_file != null) a.prompt_file = body.prompt_file;
    });

    log('INFO', `[API] Agent '${agentId}' patched`);
    return c.json({ ok: true, agent: updated.agents![agentId] });
});

// DELETE /api/agents/:id
app.delete('/api/agents/:id', (c) => {
    const agentId = c.req.param('id');
    if (agentId === 'default') {
        return c.json({ error: 'cannot delete the default agent' }, 403);
    }
    const settings = getSettings();
    if (!settings.agents?.[agentId]) {
        return c.json({ error: `agent '${agentId}' not found` }, 404);
    }
    mutateSettings(s => { delete s.agents![agentId]; });
    log('INFO', `[API] Agent '${agentId}' deleted`);
    return c.json({ ok: true });
});

// ── Agent workspace data endpoints ───────────────────────────────────────────

// GET /api/agents/:id/skills — return available (workspace + bank) + assigned skill IDs
app.get('/api/agents/:id/skills', (c) => {
    const agentId = c.req.param('id');
    const settings = getSettings();
    const agent = settings.agents?.[agentId];
    if (!agent) return c.json({ error: `agent '${agentId}' not found` }, 404);

    const { skillsDir } = getWorkspacePaths(settings);
    const bankDir = getSkillsBankDir();
    const bankSkills = readSkillsFromDir(bankDir);
    const wsSkills = readSkillsFromDir(skillsDir);
    const merged = new Map(bankSkills.map(s => [s.id, s]));
    for (const s of wsSkills) merged.set(s.id, s);
    const available = [...merged.values()];
    const assigned = agent.skills ?? available.map(s => s.id);  // null/omit = all

    return c.json({ available, assigned });
});

// PUT /api/agents/:id/skills — update skill assignment in settings.json and re-sync symlinks
app.put('/api/agents/:id/skills', async (c) => {
    const agentId = c.req.param('id');
    const settings = getSettings();
    const agent = settings.agents?.[agentId];
    if (!agent) return c.json({ error: `agent '${agentId}' not found` }, 404);

    const body = await c.req.json() as { skills: string[] };
    if (!Array.isArray(body.skills)) return c.json({ error: 'skills must be an array' }, 400);

    mutateSettings(s => {
        if (s.agents?.[agentId]) s.agents[agentId].skills = body.skills;
    });

    const { workspacePath, skillsDir } = getWorkspacePaths(settings);
    const workingDir = path.isAbsolute(agent.working_directory)
        ? agent.working_directory
        : path.join(workspacePath, agent.working_directory);

    syncAgentSkills(workingDir, skillsDir, body.skills, getSkillsBankDir());
    log('INFO', `[API] Skills updated for agent '${agentId}': ${body.skills.join(', ')}`);
    return c.json({ ok: true, assigned: body.skills });
});

// GET /api/agents/:id/skills/registry?query=seo — search skills registry
app.get('/api/agents/:id/skills/registry', async (c) => {
    const agentId = c.req.param('id');
    const query = c.req.query('query') || '';
    const settings = getSettings();
    const agent = settings.agents?.[agentId];
    if (!agent) return c.json({ error: `agent '${agentId}' not found` }, 404);
    if (!query.trim()) return c.json({ results: [] });

    const agentDir = resolveAgentDir(settings, agent.working_directory);
    try {
        await ensureSkillsCli(agentDir);
        const output = await runSkills(['find', query], agentDir);
        const cleaned = output
            .replace(/\u001b\[[0-9;]*m/g, '')
            .replace(/\x1b\[[0-9;]*m/g, '')
            .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

        const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
        const results: { ref: string; installs?: string; url?: string }[] = [];

        const refRegex = /([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+)/g;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let match: RegExpExecArray | null;
            while ((match = refRegex.exec(line)) !== null) {
                const ref = match[1];
                const installsMatch = line.match(/([\d.]+[KMB]?)\s+installs?/i);
                const installs = installsMatch ? installsMatch[1] : undefined;
                let url: string | undefined;

                const inlineUrl = line.match(/https?:\/\/\S+/);
                if (inlineUrl) {
                    url = inlineUrl[0];
                } else {
                    const next = lines[i + 1];
                    const cleanedNext = next?.replace(/^└\s*/, '');
                    if (cleanedNext && (cleanedNext.startsWith('http://') || cleanedNext.startsWith('https://'))) {
                        url = cleanedNext;
                    }
                }

                results.push({ ref, installs, url });
            }
        }

        return c.json({ results, raw: output });
    } catch (err) {
        return c.json({ error: (err as Error).message }, 500);
    }
});

// POST /api/agents/:id/skills/install — install a registry skill to codex agent
app.post('/api/agents/:id/skills/install', async (c) => {
    const agentId = c.req.param('id');
    const settings = getSettings();
    const agent = settings.agents?.[agentId];
    if (!agent) return c.json({ error: `agent '${agentId}' not found` }, 404);

    const body = await c.req.json() as { ref?: string };
    const ref = (body.ref || '').trim();
    if (!ref) return c.json({ error: 'ref is required' }, 400);

    const agentDir2 = resolveAgentDir(settings, agent.working_directory);
    try {
        await ensureSkillsCli(agentDir2);
        const output = await runSkills(['add', ref, '-a', 'codex', '-y'], agentDir2);
        return c.json({ ok: true, output });
    } catch (err) {
        return c.json({ error: (err as Error).message }, 500);
    }
});

// GET /api/agents/:id/system-prompt — read AGENTS.md from workspace
app.get('/api/agents/:id/system-prompt', (c) => {
    const agentId = c.req.param('id');
    const settings = getSettings();
    const agent = settings.agents?.[agentId];
    if (!agent) return c.json({ error: `agent '${agentId}' not found` }, 404);

    const agentDir = resolveAgentDir(settings, agent.working_directory);
    const agentsMd = path.join(agentDir, 'AGENTS.md');
    let content = '';
    if (fs.existsSync(agentsMd)) {
        try { content = fs.readFileSync(agentsMd, 'utf8'); } catch { /* skip */ }
    }
    return c.json({ content, path: agentsMd });
});

// PUT /api/agents/:id/system-prompt — write AGENTS.md to workspace
app.put('/api/agents/:id/system-prompt', async (c) => {
    const agentId = c.req.param('id');
    const settings = getSettings();
    const agent = settings.agents?.[agentId];
    if (!agent) return c.json({ error: `agent '${agentId}' not found` }, 404);

    const agentDir = resolveAgentDir(settings, agent.working_directory);
    const body = await c.req.json() as { content: string };
    const agentsMd = path.join(agentDir, 'AGENTS.md');
    fs.writeFileSync(agentsMd, body.content || '', 'utf8');
    return c.json({ ok: true });
});

// GET /api/agents/:id/memory — load memory index from workspace memory/ folder
app.get('/api/agents/:id/memory', (c) => {
    const agentId = c.req.param('id');
    const settings = getSettings();
    const agent = settings.agents?.[agentId];
    if (!agent) return c.json({ error: `agent '${agentId}' not found` }, 404);

    const agentDir = resolveAgentDir(settings, agent.working_directory);
    const { loadMemoryIndex } = require('@tinyagi/core');
    const index = loadMemoryIndex(agentDir);
    const memoryDir = path.join(agentDir, 'memory');
    const files: { name: string; path: string }[] = [];

    if (fs.existsSync(memoryDir)) {
        const scan = (dir: string, rel: string) => {
            for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
                if (item.name.startsWith('.')) continue;
                const itemRel = rel ? `${rel}/${item.name}` : item.name;
                if (item.isDirectory()) {
                    scan(path.join(dir, item.name), itemRel);
                } else if (item.name.endsWith('.md')) {
                    files.push({ name: item.name, path: itemRel });
                }
            }
        };
        scan(memoryDir, '');
    }

    return c.json({ index, files, memoryDir });
});

// GET /api/agents/:id/heartbeat — read heartbeat.md and settings from workspace
app.get('/api/agents/:id/heartbeat', (c) => {
    const agentId = c.req.param('id');
    const settings = getSettings();
    const agent = settings.agents?.[agentId];
    if (!agent) return c.json({ error: `agent '${agentId}' not found` }, 404);

    const agentDir = resolveAgentDir(settings, agent.working_directory);
    const heartbeatMd = path.join(agentDir, 'heartbeat.md');
    let content = '';
    if (fs.existsSync(heartbeatMd)) {
        try { content = fs.readFileSync(heartbeatMd, 'utf8'); } catch { /* skip */ }
    }
    return c.json({
        content,
        path: heartbeatMd,
        enabled: agent.heartbeat?.enabled ?? true,
        interval: agent.heartbeat?.interval,
    });
});

// PUT /api/agents/:id/heartbeat — write heartbeat.md and settings to workspace
app.put('/api/agents/:id/heartbeat', async (c) => {
    const agentId = c.req.param('id');
    const settings = getSettings();
    const agent = settings.agents?.[agentId];
    if (!agent) return c.json({ error: `agent '${agentId}' not found` }, 404);

    const body = await c.req.json() as { content?: string; enabled?: boolean; interval?: number };

    // Write heartbeat.md if content provided
    if (body.content != null) {
        const agentDir = resolveAgentDir(settings, agent.working_directory);
        const heartbeatMd = path.join(agentDir, 'heartbeat.md');
        fs.writeFileSync(heartbeatMd, body.content || '', 'utf8');
    }

    // Persist heartbeat overrides to settings.json
    if (body.enabled != null || body.interval != null) {
        mutateSettings(s => {
            if (!s.agents?.[agentId]) return;
            if (!s.agents[agentId].heartbeat) s.agents[agentId].heartbeat = {};
            if (body.enabled != null) s.agents[agentId].heartbeat!.enabled = body.enabled;
            if (body.interval != null) s.agents[agentId].heartbeat!.interval = body.interval;
        });
    }

    return c.json({ ok: true });
});

// ── Custom Providers ─────────────────────────────────────────────────────────

// GET /api/custom-providers
app.get('/api/custom-providers', (c) => {
    const settings = getSettings();
    return c.json(settings.custom_providers || {});
});

// PUT /api/custom-providers/:id
app.put('/api/custom-providers/:id', async (c) => {
    const providerId = c.req.param('id');
    const body = await c.req.json() as Partial<CustomProvider>;
    if (!body.name || !body.harness || !body.base_url || !body.api_key) {
        return c.json({ error: 'name, harness, base_url, and api_key are required' }, 400);
    }
    if (!['claude', 'codex', 'native-openai'].includes(body.harness)) {
        return c.json({ error: 'harness must be "claude", "codex", or "native-openai"' }, 400);
    }

    const settings = mutateSettings(s => {
        if (!s.custom_providers) s.custom_providers = {};
        s.custom_providers[providerId] = {
            name: body.name!,
            harness: body.harness!,
            base_url: body.base_url!,
            api_key: body.api_key!,
            ...(body.model ? { model: body.model } : {}),
        };
    });

    log('INFO', `[API] Custom provider '${providerId}' saved`);
    return c.json({ ok: true, provider: settings.custom_providers![providerId] });
});

// DELETE /api/custom-providers/:id
app.delete('/api/custom-providers/:id', (c) => {
    const providerId = c.req.param('id');
    const settings = getSettings();
    if (!settings.custom_providers?.[providerId]) {
        return c.json({ error: `custom provider '${providerId}' not found` }, 404);
    }
    mutateSettings(s => { delete s.custom_providers![providerId]; });
    log('INFO', `[API] Custom provider '${providerId}' deleted`);
    return c.json({ ok: true });
});

// ── Permissions ──────────────────────────────────────────────────────────────

// GET /api/agents/:id/permissions
app.get('/api/agents/:id/permissions', (c) => {
    const agentId = c.req.param('id');
    const settings = getSettings();
    const agent = settings.agents?.[agentId];
    if (!agent) return c.json({ error: `agent '${agentId}' not found` }, 404);
    const { resolvePermissions } = require('@tinyagi/core');
    return c.json(resolvePermissions(agent));
});

// PUT /api/agents/:id/permissions
app.put('/api/agents/:id/permissions', async (c) => {
    const agentId = c.req.param('id');
    const settings = getSettings();
    if (!settings.agents?.[agentId]) {
        return c.json({ error: `agent '${agentId}' not found` }, 404);
    }
    const body = await c.req.json();
    mutateSettings(s => {
        if (s.agents?.[agentId]) {
            s.agents[agentId].permissions = body;
        }
    });
    log('INFO', `[API] Permissions updated for agent '${agentId}'`);
    return c.json({ ok: true, permissions: body });
});

// ── Clear history ────────────────────────────────────────────────────────────

// POST /api/agents/:id/clear-history
app.post('/api/agents/:id/clear-history', (c) => {
    const agentId = c.req.param('id');
    const settings = getSettings();
    const agent = settings.agents?.[agentId];
    if (!agent) return c.json({ error: `agent '${agentId}' not found` }, 404);

    const { clearAgentHistory } = require('@tinyagi/core');
    const cleared = clearAgentHistory(agentId);

    // Write reset_flag to agent workspace dir
    const agentDir = resolveAgentDir(settings, agent.working_directory);
    const resetFlagPath = path.join(agentDir, 'reset_flag');
    try {
        fs.writeFileSync(resetFlagPath, 'reset', 'utf8');
    } catch { /* skip */ }

    // Delete conversation.json if native-openai provider
    const convPath = path.join(agentDir, 'conversation.json');
    if (fs.existsSync(convPath)) {
        try { fs.unlinkSync(convPath); } catch { /* skip */ }
    }

    log('INFO', `[API] Cleared ${cleared} messages for agent '${agentId}'`);
    return c.json({ ok: true, cleared });
});

export default app;
