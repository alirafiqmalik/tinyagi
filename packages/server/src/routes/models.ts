import { Hono } from 'hono';
import { getModelRegistryAsync, getModelsByVendorAsync, getVendorsAsync } from '@tinyagi/core';

const app = new Hono();

// GET /api/models — list all available models (async with provider discovery)
app.get('/api/models', async (c) => {
    const [models, vendors, byVendor] = await Promise.all([
        getModelRegistryAsync(),
        getVendorsAsync(),
        getModelsByVendorAsync(),
    ]);
    return c.json({ models, vendors, byVendor });
});

export default app;
