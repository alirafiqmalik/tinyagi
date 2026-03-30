import { Hono } from 'hono';
import { listSkillsBank, getSkillContent, migrateWorkspaceSkillsToBank } from '@tinyagi/core';
import { log } from '@tinyagi/core';

const app = new Hono();

// GET /api/skills-bank
app.get('/api/skills-bank', (c) => {
    return c.json(listSkillsBank());
});

// GET /api/skills-bank/:id
app.get('/api/skills-bank/:id', (c) => {
    const id = c.req.param('id');
    const content = getSkillContent(id);
    if (content === null) return c.json({ error: `skill '${id}' not found` }, 404);
    return c.json({ id, content });
});

// POST /api/skills-bank/migrate — copy workspace skills into the bank
app.post('/api/skills-bank/migrate', (c) => {
    const result = migrateWorkspaceSkillsToBank();
    log('INFO', `[API] Skills bank migration: ${result.migrated.length} migrated, ${result.skipped.length} skipped`);
    return c.json({ ok: true, ...result });
});

export default app;
