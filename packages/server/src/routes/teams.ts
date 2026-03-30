import { Hono } from 'hono';
import { TeamConfig, TeamMember, DEFAULT_TEAM_MEMBER_PERMISSIONS } from '@tinyagi/core';
import { getSettings, getTeams, migrateTeamConfig } from '@tinyagi/core';
import { log } from '@tinyagi/core';
import { mutateSettings } from './settings';

const app = new Hono();

// GET /api/teams — returns all teams, auto-migrating legacy format
app.get('/api/teams', (c) => {
    const rawTeams = getTeams(getSettings()) as unknown as Record<string, Record<string, unknown>>;
    const migrated: Record<string, TeamConfig> = {};
    for (const [id, raw] of Object.entries(rawTeams)) {
        migrated[id] = migrateTeamConfig(raw);
    }
    return c.json(migrated);
});

// PUT /api/teams/:id
app.put('/api/teams/:id', async (c) => {
    const teamId = c.req.param('id');
    const body = await c.req.json() as Partial<TeamConfig>;

    if (!body.name) {
        return c.json({ error: 'name is required' }, 400);
    }

    // Normalise members: accept both new format (members[]) and legacy (agents[])
    let members: TeamMember[] = [];
    if (Array.isArray(body.members)) {
        members = body.members;
    } else if (Array.isArray((body as unknown as { agents?: string[] }).agents)) {
        // Legacy fallback: wrap agent IDs
        members = ((body as unknown as { agents: string[] }).agents).map((id: string) => ({
            agent_id: id,
            role_tag: '',
            permissions: { ...DEFAULT_TEAM_MEMBER_PERMISSIONS },
        }));
    }

    const team: TeamConfig = {
        name: body.name,
        team_prompt: body.team_prompt,
        working_directory: body.working_directory,
        members,
        leader_agent: body.leader_agent || (members[0]?.agent_id ?? ''),
        team_skills: body.team_skills || [],
    };

    const settings = mutateSettings(s => {
        if (!s.teams) s.teams = {};
        s.teams[teamId] = team as unknown as import('@tinyagi/core').TeamConfig;
    });

    log('INFO', `[API] Team '${teamId}' saved`);
    return c.json({ ok: true, team: (settings.teams as Record<string, TeamConfig>)![teamId] });
});

// DELETE /api/teams/:id
app.delete('/api/teams/:id', (c) => {
    const teamId = c.req.param('id');
    const settings = getSettings();
    if (!settings.teams?.[teamId]) {
        return c.json({ error: `team '${teamId}' not found` }, 404);
    }
    mutateSettings(s => { delete s.teams![teamId]; });
    log('INFO', `[API] Team '${teamId}' deleted`);
    return c.json({ ok: true });
});

export default app;
