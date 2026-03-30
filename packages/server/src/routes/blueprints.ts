import { Hono } from 'hono';
import {
    listBlueprints,
    getBlueprint,
    getBlueprintSystemPrompt,
    createBlueprint,
    updateBlueprint,
    setBlueprintSystemPrompt,
    deleteBlueprint,
    BlueprintAgent,
} from '@tinyagi/core';
import { getSettings } from '@tinyagi/core';
import { log } from '@tinyagi/core';

const app = new Hono();

// GET /api/blueprints
app.get('/api/blueprints', (c) => {
    return c.json(listBlueprints());
});

// GET /api/blueprints/:id
app.get('/api/blueprints/:id', (c) => {
    const id = c.req.param('id');
    const bp = getBlueprint(id);
    if (!bp) return c.json({ error: `blueprint '${id}' not found` }, 404);
    return c.json(bp);
});

// POST /api/blueprints
app.post('/api/blueprints', async (c) => {
    const body = await c.req.json() as Partial<BlueprintAgent>;
    if (!body.name || !body.provider || !body.model) {
        return c.json({ error: 'name, provider, and model are required' }, 400);
    }
    const bp = createBlueprint({
        name: body.name,
        provider: body.provider,
        model: body.model,
        skills: body.skills,
        copied_from: body.copied_from,
    });
    log('INFO', `[API] Blueprint created: ${bp.id} (${bp.name})`);
    return c.json({ ok: true, blueprint: bp }, 201);
});

// PUT /api/blueprints/:id
app.put('/api/blueprints/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json() as Partial<BlueprintAgent>;
    const updated = updateBlueprint(id, body);
    if (!updated) return c.json({ error: `blueprint '${id}' not found` }, 404);
    log('INFO', `[API] Blueprint updated: ${id}`);
    return c.json({ ok: true, blueprint: updated });
});

// DELETE /api/blueprints/:id
app.delete('/api/blueprints/:id', (c) => {
    const id = c.req.param('id');
    if (!deleteBlueprint(id)) return c.json({ error: `blueprint '${id}' not found` }, 404);
    log('INFO', `[API] Blueprint deleted: ${id}`);
    return c.json({ ok: true });
});

// GET /api/blueprints/:id/system-prompt
app.get('/api/blueprints/:id/system-prompt', (c) => {
    const id = c.req.param('id');
    if (!getBlueprint(id)) return c.json({ error: `blueprint '${id}' not found` }, 404);
    return c.json({ system_prompt: getBlueprintSystemPrompt(id) });
});

// PUT /api/blueprints/:id/system-prompt
app.put('/api/blueprints/:id/system-prompt', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json() as { system_prompt: string };
    if (typeof body.system_prompt !== 'string') {
        return c.json({ error: 'system_prompt is required' }, 400);
    }
    if (!setBlueprintSystemPrompt(id, body.system_prompt)) {
        return c.json({ error: `blueprint '${id}' not found` }, 404);
    }
    log('INFO', `[API] Blueprint system prompt updated: ${id}`);
    return c.json({ ok: true });
});

// POST /api/blueprints/copy-from-agent — clone a Task Agent as a Blueprint
app.post('/api/blueprints/copy-from-agent', async (c) => {
    const body = await c.req.json() as { agent_id: string; name?: string };
    if (!body.agent_id) return c.json({ error: 'agent_id is required' }, 400);

    const settings = getSettings();
    const agent = settings.agents?.[body.agent_id];
    if (!agent) return c.json({ error: `agent '${body.agent_id}' not found` }, 404);

    const bp = createBlueprint({
        name: body.name || agent.name,
        provider: agent.provider,
        model: agent.model,
        skills: agent.skills,
        copied_from: body.agent_id,
    });

    // Copy system prompt if the agent has one
    if (agent.system_prompt) {
        setBlueprintSystemPrompt(bp.id, agent.system_prompt);
    }

    log('INFO', `[API] Blueprint created from agent '${body.agent_id}': ${bp.id}`);
    return c.json({ ok: true, blueprint: bp }, 201);
});

export default app;
