import { Hono } from 'hono';
import {
    createSession, listSessions, getSessionById, deleteSession,
    CreateSessionInput,
} from '@tinyagi/core';
import { log } from '@tinyagi/core';

const app = new Hono();

// GET /api/sessions — list all active session tabs
app.get('/api/sessions', (c) => {
    return c.json(listSessions());
});

// GET /api/sessions/:id — get a single session
app.get('/api/sessions/:id', (c) => {
    const session = getSessionById(c.req.param('id'));
    if (!session) return c.json({ error: 'session not found' }, 404);
    return c.json(session);
});

// POST /api/sessions — create a new session tab
app.post('/api/sessions', async (c) => {
    const body = await c.req.json() as CreateSessionInput;
    if (!body.provider || !body.model || !body.working_directory) {
        return c.json({ error: 'provider, model, and working_directory are required' }, 400);
    }
    const session = createSession(body);
    log('INFO', `[API] Session '${session.id}' created`);
    return c.json(session, 201);
});

// DELETE /api/sessions/:id — destroy a session tab
app.delete('/api/sessions/:id', (c) => {
    const id = c.req.param('id');
    const ok = deleteSession(id);
    if (!ok) return c.json({ error: 'session not found or already destroyed' }, 404);
    log('INFO', `[API] Session '${id}' destroyed`);
    return c.json({ ok: true });
});

export default app;
