import fs from 'fs';
import { Hono } from 'hono';
import { getSettings, log } from '@tinyagi/core';
import { mutateSettings } from './settings';

const app = new Hono();

// GET /api/directories — list known working directories
app.get('/api/directories', (c) => {
    const settings = getSettings();
    return c.json(settings.directories || []);
});

// POST /api/directories — add a new directory
app.post('/api/directories', async (c) => {
    const body = await c.req.json() as { path: string };
    const dirPath = (body.path || '').trim();
    if (!dirPath) return c.json({ error: 'path is required' }, 400);

    // Validate directory exists
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        return c.json({ error: 'path does not exist or is not a directory' }, 400);
    }

    const settings = getSettings();
    const dirs = settings.directories || [];
    if (dirs.includes(dirPath)) {
        return c.json({ error: 'directory already registered' }, 409);
    }

    mutateSettings(s => {
        if (!s.directories) s.directories = [];
        s.directories.push(dirPath);
    });

    log('INFO', `[API] Directory added: ${dirPath}`);
    return c.json({ ok: true, directories: [...dirs, dirPath] }, 201);
});

// DELETE /api/directories — remove a directory from the list
app.delete('/api/directories', async (c) => {
    const body = await c.req.json() as { path: string };
    const dirPath = (body.path || '').trim();
    if (!dirPath) return c.json({ error: 'path is required' }, 400);

    const settings = getSettings();
    const dirs = settings.directories || [];
    if (!dirs.includes(dirPath)) {
        return c.json({ error: 'directory not found' }, 404);
    }

    mutateSettings(s => {
        s.directories = (s.directories || []).filter(d => d !== dirPath);
    });

    log('INFO', `[API] Directory removed: ${dirPath}`);
    return c.json({ ok: true });
});

export default app;
