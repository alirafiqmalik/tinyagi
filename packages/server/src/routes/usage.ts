/**
 * Usage tracking route — Combines:
 *  1. Real-time rate limit data from Claude Code CLI (rate_limit_event)
 *  2. Historical token usage parsed from ~/.claude/ JSONL conversation files
 *
 * The rate limit data (resetsAt, status) comes from an actual Claude API probe,
 * so it matches exactly what claude.ai/settings shows.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import os from 'os';
import { spawn } from 'child_process';
import { Hono } from 'hono';
import { log } from '@tinyagi/core';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const CREDENTIALS_FILE = path.join(CLAUDE_DIR, '.credentials.json');
const USAGE_CONFIG_FILE = path.join(CLAUDE_DIR, 'usage-config.json');

// ── Usage config (reset schedule, token budgets) ─────────────────────────

interface UsageConfig {
    weeklyResetDay: number;   // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    weeklyResetHour: number;  // 0-23, in local time
    sessionWindowHours: number;
    weeklyTokenBudget: number | null;
}

function readUsageConfig(): UsageConfig {
    try {
        if (fs.existsSync(USAGE_CONFIG_FILE)) {
            const raw = JSON.parse(fs.readFileSync(USAGE_CONFIG_FILE, 'utf8'));
            return {
                weeklyResetDay: raw.weekly_reset_day ?? 5,
                weeklyResetHour: raw.weekly_reset_hour ?? 0,
                sessionWindowHours: raw.session_window_hours ?? 5,
                weeklyTokenBudget: raw.weekly_token_budget ?? null,
            };
        }
    } catch { /* ignore */ }
    return { weeklyResetDay: 5, weeklyResetHour: 0, sessionWindowHours: 5, weeklyTokenBudget: null };
}

/**
 * Detect the actual weekly reset time by looking for the last large usage gap
 * on the reset day (after noon). The end of a 2h+ gap = when the new week started.
 * Falls back to config hour (midnight) if no qualifying gap found.
 *
 * Why: usage-config.json weekly_reset_hour is often 0 (UTC midnight) but the
 * actual local reset (e.g. Fri 10 PM EDT) is different. The gap in the usage
 * data is the ground truth.
 */
function detectWeeklyStart(
    usageData: Array<{ timestamp: number }>,
    resetDay: number,
    fallbackHour: number,
    now: Date,
): { start: Date; end: Date } {
    // Find the most recent occurrence of resetDay (in local time)
    const target = new Date(now);
    const daysDiff = (target.getDay() - resetDay + 7) % 7;
    target.setDate(target.getDate() - daysDiff);
    target.setHours(0, 0, 0, 0);
    if (target.getTime() > now.getTime()) {
        target.setDate(target.getDate() - 7);
    }

    const dayStart = target.getTime();
    const noon = dayStart + 12 * 3600_000;
    const dayEnd = dayStart + 24 * 3600_000;

    // Timestamps on that day after noon, sorted ascending
    const afterNoon = usageData
        .filter(e => e.timestamp >= noon && e.timestamp < dayEnd)
        .map(e => e.timestamp)
        .sort((a, b) => a - b);

    let detectedStart: Date | null = null;

    if (afterNoon.length >= 2) {
        // Find the latest gap ≥ 2 hours (each gap-end = potential reset time)
        let latestGapEnd = -1;
        for (let i = 1; i < afterNoon.length; i++) {
            if (afterNoon[i] - afterNoon[i - 1] >= 2 * 3600_000) {
                latestGapEnd = afterNoon[i];
            }
        }
        if (latestGapEnd > 0) {
            const t = new Date(latestGapEnd);
            t.setMinutes(0, 0, 0); // round down to hour
            detectedStart = t;
        }
    }

    const start = detectedStart ?? (() => {
        const fb = new Date(target);
        fb.setHours(fallbackHour, 0, 0, 0);
        return fb;
    })();

    const end = new Date(start.getTime() + 7 * 24 * 3600_000);
    return { start, end };
}

// ── Rate limit cache (avoid hammering Claude CLI on every page load) ─────

interface RateLimitInfo {
    status: string;           // "allowed" | "allowed_warning" | "limited"
    resetsAt: number;         // Unix timestamp (seconds)
    rateLimitType: string;    // "five_hour"
    utilization?: number;     // 0–1 fraction of session window used
    surpassedThreshold?: number;
    overageStatus?: string;   // "rejected" | "accepted" (not always present)
    overageDisabledReason?: string;
    isUsingOverage: boolean;
    fetchedAt: number;        // When we last fetched (ms)
}

let cachedRateLimit: RateLimitInfo | null = null;
const RATE_LIMIT_CACHE_TTL = 60_000; // Re-fetch at most every 60s

interface AccountInfo {
    subscriptionType: string;  // "pro", "free", etc.
    rateLimitTier: string;     // "default_claude_ai"
}

function readAccountInfo(): AccountInfo {
    try {
        if (fs.existsSync(CREDENTIALS_FILE)) {
            const creds = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
            return {
                subscriptionType: creds.claudeAiOauth?.subscriptionType || 'unknown',
                rateLimitTier: creds.claudeAiOauth?.rateLimitTier || 'unknown',
            };
        }
    } catch { /* ignore */ }
    return { subscriptionType: 'unknown', rateLimitTier: 'unknown' };
}

/**
 * Probe Claude CLI for real rate limit info.
 * Sends a minimal message and captures the rate_limit_event from stream-json output.
 */
function fetchRateLimitInfo(): Promise<RateLimitInfo | null> {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            proc.kill();
            resolve(null);
        }, 15_000);

        const proc = spawn('claude', [
            '-p', 'reply with only the word "ok"',
            '--output-format', 'stream-json',
            '--verbose',
            '--max-budget-usd', '0.05',
            '--no-session-persistence',
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, HOME: os.homedir() },
        });

        let output = '';
        proc.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
        proc.stderr.on('data', () => { /* ignore */ });

        proc.on('close', () => {
            clearTimeout(timeout);
            // Parse each line looking for rate_limit_event
            for (const line of output.split('\n')) {
                try {
                    const d = JSON.parse(line);
                    if (d.type === 'rate_limit_event' && d.rate_limit_info) {
                        const info: RateLimitInfo = {
                            ...d.rate_limit_info,
                            fetchedAt: Date.now(),
                        };
                        resolve(info);
                        return;
                    }
                } catch { /* skip non-JSON lines */ }
            }
            resolve(null);
        });

        proc.on('error', () => {
            clearTimeout(timeout);
            resolve(null);
        });
    });
}

async function getRateLimitInfo(): Promise<RateLimitInfo | null> {
    // Return cached if fresh enough
    if (cachedRateLimit && (Date.now() - cachedRateLimit.fetchedAt) < RATE_LIMIT_CACHE_TTL) {
        return cachedRateLimit;
    }
    try {
        const info = await fetchRateLimitInfo();
        if (info) {
            cachedRateLimit = info;
            log('INFO', `[Usage] Rate limit fetched: resets at ${new Date(info.resetsAt * 1000).toISOString()}, status=${info.status}`);
        }
        return info;
    } catch (err) {
        log('ERROR', `[Usage] Failed to fetch rate limit: ${err}`);
        return cachedRateLimit; // Return stale cache if available
    }
}

// ── Token usage parsing from JSONL files ─────────────────────────────────

interface TokenUsage {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
}

function totalOf(u: TokenUsage): number {
    return u.input_tokens + u.output_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens;
}

interface DailyUsage {
    date: string;
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    total_tokens: number;
    message_count: number;
    cost_usd: number;
}

function addUsage(target: TokenUsage, source: TokenUsage): void {
    target.input_tokens += source.input_tokens;
    target.output_tokens += source.output_tokens;
    target.cache_creation_input_tokens += source.cache_creation_input_tokens;
    target.cache_read_input_tokens += source.cache_read_input_tokens;
}

async function parseJSONLFile(filePath: string): Promise<Array<{ timestamp: number; usage: TokenUsage; costUsd: number }>> {
    const results: Array<{ timestamp: number; usage: TokenUsage; costUsd: number }> = [];

    const stream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            const msg = data?.message;
            if (!msg?.usage) continue;
            if (msg.role !== 'assistant') continue;

            const usage: TokenUsage = {
                input_tokens: msg.usage.input_tokens || 0,
                output_tokens: msg.usage.output_tokens || 0,
                cache_creation_input_tokens: msg.usage.cache_creation_input_tokens || 0,
                cache_read_input_tokens: msg.usage.cache_read_input_tokens || 0,
            };

            let timestamp = 0;
            if (data.timestamp) {
                const ts = data.timestamp;
                timestamp = typeof ts === 'string' ? new Date(ts).getTime() : ts;
            }
            if (!timestamp || isNaN(timestamp)) {
                try { timestamp = fs.statSync(filePath).mtimeMs; } catch { timestamp = Date.now(); }
            }

            // Estimate cost using Opus pricing (input: $15/M, output: $75/M, cache_read: $1.5/M, cache_create: $18.75/M)
            const costUsd =
                (usage.input_tokens * 15 / 1_000_000) +
                (usage.output_tokens * 75 / 1_000_000) +
                (usage.cache_read_input_tokens * 1.5 / 1_000_000) +
                (usage.cache_creation_input_tokens * 18.75 / 1_000_000);

            results.push({ timestamp, usage, costUsd });
        } catch { /* skip */ }
    }

    return results;
}

function findJsonlFiles(dir: string): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dir)) return files;
    try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...findJsonlFiles(full));
            } else if (entry.name.endsWith('.jsonl')) {
                files.push(full);
            }
        }
    } catch { /* permission errors */ }
    return files;
}

// ── Routes ───────────────────────────────────────────────────────────────

const app = new Hono();

// GET /api/usage — Main usage dashboard data
app.get('/api/usage', async (c) => {
    try {
        const now = new Date();
        const account = readAccountInfo();
        const usageConfig = readUsageConfig();

        // Fetch real rate limit info from Claude CLI
        const rateLimit = await getRateLimitInfo();

        // Determine the session rate limit window
        const windowHours = usageConfig.sessionWindowHours;
        let sessionResetAt: Date;
        let sessionWindowStart: Date;
        if (rateLimit) {
            // Use actual reset time from Claude
            sessionResetAt = new Date(rateLimit.resetsAt * 1000);
            sessionWindowStart = new Date(sessionResetAt.getTime() - windowHours * 3600_000);
        } else {
            // Fallback: use last windowHours as the window
            sessionWindowStart = new Date(now.getTime() - windowHours * 3600_000);
            sessionResetAt = new Date(now.getTime() + windowHours * 3600_000);
        }

        // Collect and parse JSONL files (last 2 weeks)
        const jsonlFiles = findJsonlFiles(PROJECTS_DIR);
        const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const recentFiles = jsonlFiles.filter(f => {
            try { return fs.statSync(f).mtimeMs >= twoWeeksAgo; } catch { return false; }
        });

        const allUsageData: Array<{ timestamp: number; usage: TokenUsage; costUsd: number }> = [];
        for (const file of recentFiles) {
            const entries = await parseJSONLFile(file);
            allUsageData.push(...entries);
        }
        allUsageData.sort((a, b) => a.timestamp - b.timestamp);

        // Weekly window: detect from usage gap on reset day (ground truth reset time)
        const weeklyBounds = detectWeeklyStart(
            allUsageData, usageConfig.weeklyResetDay, usageConfig.weeklyResetHour, now,
        );

        // --- Daily aggregation ---
        const dailyMap = new Map<string, DailyUsage>();
        for (const entry of allUsageData) {
            const date = new Date(entry.timestamp).toISOString().slice(0, 10);
            const existing = dailyMap.get(date) || {
                date, input_tokens: 0, output_tokens: 0,
                cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
                total_tokens: 0, message_count: 0, cost_usd: 0,
            };
            addUsage(existing, entry.usage);
            existing.total_tokens = totalOf(existing);
            existing.message_count += 1;
            existing.cost_usd += entry.costUsd;
            dailyMap.set(date, existing);
        }

        // --- Session window usage (actual 5h window from rate limit data) ---
        const sessionData = allUsageData.filter(e => e.timestamp >= sessionWindowStart.getTime());
        const sessionUsage: TokenUsage & { total_tokens: number; message_count: number; cost_usd: number } = {
            input_tokens: 0, output_tokens: 0,
            cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            total_tokens: 0, message_count: 0, cost_usd: 0,
        };
        for (const entry of sessionData) {
            addUsage(sessionUsage, entry.usage);
            sessionUsage.message_count += 1;
            sessionUsage.cost_usd += entry.costUsd;
        }
        sessionUsage.total_tokens = totalOf(sessionUsage);

        // --- Weekly usage (calendar week from last reset to next reset) ---
        const weekStart = weeklyBounds.start;
        const weeklyData = allUsageData.filter(e => e.timestamp >= weekStart.getTime());
        const weeklyUsage: TokenUsage & { total_tokens: number; message_count: number; cost_usd: number } = {
            input_tokens: 0, output_tokens: 0,
            cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            total_tokens: 0, message_count: 0, cost_usd: 0,
        };
        for (const entry of weeklyData) {
            addUsage(weeklyUsage, entry.usage);
            weeklyUsage.message_count += 1;
            weeklyUsage.cost_usd += entry.costUsd;
        }
        weeklyUsage.total_tokens = totalOf(weeklyUsage);

        // --- Active sessions ---
        const activeSessions: Array<{ sessionId: string; project: string; startedAt: number }> = [];
        const sessionsDir = path.join(CLAUDE_DIR, 'sessions');
        if (fs.existsSync(sessionsDir)) {
            for (const file of fs.readdirSync(sessionsDir)) {
                if (!file.endsWith('.json')) continue;
                try {
                    const sess = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
                    activeSessions.push({
                        sessionId: sess.sessionId,
                        project: sess.cwd || '',
                        startedAt: sess.startedAt || 0,
                    });
                } catch { /* skip */ }
            }
        }

        return c.json({
            account,
            rateLimit: rateLimit ? {
                status: rateLimit.status,
                resetsAt: new Date(rateLimit.resetsAt * 1000).toISOString(),
                msUntilReset: Math.max(0, rateLimit.resetsAt * 1000 - now.getTime()),
                rateLimitType: rateLimit.rateLimitType,
                utilization: rateLimit.utilization ?? null,
                overageStatus: rateLimit.overageStatus ?? 'unknown',
                isUsingOverage: rateLimit.isUsingOverage,
                fetchedAt: new Date(rateLimit.fetchedAt).toISOString(),
            } : null,
            session: {
                ...sessionUsage,
                windowHours,
                windowStart: sessionWindowStart.toISOString(),
                resetAt: sessionResetAt.toISOString(),
                msUntilReset: Math.max(0, sessionResetAt.getTime() - now.getTime()),
            },
            weekly: {
                ...weeklyUsage,
                periodStart: weeklyBounds.start.toISOString(),
                periodEnd: weeklyBounds.end.toISOString(),   // next reset time
                msElapsed: now.getTime() - weeklyBounds.start.getTime(),
                weeklyTokenBudget: usageConfig.weeklyTokenBudget,
            },
            daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-14),
            activeSessions,
            totalFiles: recentFiles.length,
            totalProjects: new Set(recentFiles.map(f => path.basename(path.dirname(f)))).size,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        log('ERROR', `[API] Usage fetch failed: ${message}`);
        return c.json({ error: message }, 500);
    }
});

// POST /api/usage/refresh-rate-limit — Force refresh rate limit from Claude CLI
app.post('/api/usage/refresh-rate-limit', async (c) => {
    cachedRateLimit = null; // Clear cache
    const info = await getRateLimitInfo();
    if (!info) return c.json({ error: 'Failed to fetch rate limit info' }, 500);
    return c.json({
        ok: true,
        rateLimit: {
            status: info.status,
            resetsAt: new Date(info.resetsAt * 1000).toISOString(),
            rateLimitType: info.rateLimitType,
            overageStatus: info.overageStatus,
        },
    });
});

export default app;
