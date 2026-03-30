import fs from 'fs';
import path from 'path';
import { Hono } from 'hono';
import { TINYAGI_HOME } from '@tinyagi/core';
import { log } from '@tinyagi/core';
import { ProjectTeam, ProjectAgent } from '@tinyagi/core';

type ProjectStatus = 'active' | 'archived';

interface Project {
    id: string;
    name: string;
    description: string;
    context_prompt?: string;
    status: ProjectStatus;
    skills?: string[];
    memory_enabled?: boolean;
    assigned_teams: ProjectTeam[];
    assigned_agents: ProjectAgent[];
    // Legacy field kept for migration read-back
    working_directory?: string;
    createdAt: number;
    updatedAt: number;
}

const PROJECTS_FILE = path.join(TINYAGI_HOME, 'projects.json');

function readProjects(): Project[] {
    try {
        if (!fs.existsSync(PROJECTS_FILE)) return [];
        const raw = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')) as Project[];
        // Auto-migrate: ensure new fields exist on legacy records
        return raw.map(p => ({
            ...p,
            context_prompt: p.context_prompt ?? '',
            skills: p.skills ?? [],
            memory_enabled: p.memory_enabled ?? false,
            assigned_teams: p.assigned_teams ?? [],
            assigned_agents: p.assigned_agents ?? [],
        }));
    } catch {
        return [];
    }
}

function writeProjects(projects: Project[]): void {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2) + '\n');
}

const app = new Hono();

// GET /api/projects
app.get('/api/projects', (c) => {
    return c.json(readProjects());
});

// POST /api/projects
app.post('/api/projects', async (c) => {
    const body = await c.req.json() as Partial<Project>;
    if (!body.name) {
        return c.json({ error: 'name is required' }, 400);
    }
    const projects = readProjects();
    const project: Project = {
        id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: body.name,
        description: body.description || '',
        context_prompt: body.context_prompt || '',
        status: body.status || 'active',
        skills: body.skills || [],
        memory_enabled: body.memory_enabled || false,
        assigned_teams: body.assigned_teams || [],
        assigned_agents: body.assigned_agents || [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    projects.push(project);
    writeProjects(projects);
    log('INFO', `[API] Project created: ${project.name}`);
    return c.json({ ok: true, project });
});

// PUT /api/projects/:id
app.put('/api/projects/:id', async (c) => {
    const projectId = c.req.param('id');
    const body = await c.req.json() as Partial<Project>;
    const projects = readProjects();
    const idx = projects.findIndex(p => p.id === projectId);
    if (idx === -1) return c.json({ error: 'project not found' }, 404);
    projects[idx] = { ...projects[idx], ...body, id: projectId, updatedAt: Date.now() };
    writeProjects(projects);
    log('INFO', `[API] Project updated: ${projectId}`);
    return c.json({ ok: true, project: projects[idx] });
});

// POST /api/projects/validate-dir — Check if a directory path exists on the server
app.post('/api/projects/validate-dir', async (c) => {
    const body = await c.req.json() as { path: string };
    if (!body.path) return c.json({ exists: false, error: 'path is required' }, 400);
    const exists = fs.existsSync(body.path) && fs.statSync(body.path).isDirectory();
    return c.json({ exists });
});

// DELETE /api/projects/:id
app.delete('/api/projects/:id', (c) => {
    const projectId = c.req.param('id');
    const projects = readProjects();
    const idx = projects.findIndex(p => p.id === projectId);
    if (idx === -1) return c.json({ error: 'project not found' }, 404);
    projects.splice(idx, 1);
    writeProjects(projects);
    log('INFO', `[API] Project deleted: ${projectId}`);
    return c.json({ ok: true });
});

export default app;
