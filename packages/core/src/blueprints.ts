/**
 * Blueprint Agent CRUD — filesystem-based storage in ~/.tinyagi/blueprints/<id>/
 *
 * Each blueprint has:
 *   config.json        — { id, name, provider, model, skills, created_at, updated_at, copied_from? }
 *   SYSTEM_PROMPT.md   — agent's core identity prompt (plain text)
 */

import fs from 'fs';
import path from 'path';
import { BlueprintAgent } from './types';
import { getBlueprintsDir } from './config';

function blueprintDir(id: string): string {
    return path.join(getBlueprintsDir(), id);
}

function configPath(id: string): string {
    return path.join(blueprintDir(id), 'config.json');
}

function promptPath(id: string): string {
    return path.join(blueprintDir(id), 'SYSTEM_PROMPT.md');
}

function ensureBlueprintsDir(): void {
    fs.mkdirSync(getBlueprintsDir(), { recursive: true });
}

export function listBlueprints(): BlueprintAgent[] {
    ensureBlueprintsDir();
    const dir = getBlueprintsDir();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const blueprints: BlueprintAgent[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const cfgFile = path.join(dir, entry.name, 'config.json');
        if (!fs.existsSync(cfgFile)) continue;
        try {
            const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')) as BlueprintAgent;
            blueprints.push(cfg);
        } catch {
            // skip corrupt entries
        }
    }
    return blueprints.sort((a, b) => a.created_at - b.created_at);
}

export function getBlueprint(id: string): BlueprintAgent | null {
    const cfg = configPath(id);
    if (!fs.existsSync(cfg)) return null;
    try {
        return JSON.parse(fs.readFileSync(cfg, 'utf8')) as BlueprintAgent;
    } catch {
        return null;
    }
}

export function getBlueprintSystemPrompt(id: string): string {
    const p = promptPath(id);
    if (!fs.existsSync(p)) return '';
    return fs.readFileSync(p, 'utf8');
}

export function createBlueprint(data: Omit<BlueprintAgent, 'id' | 'created_at' | 'updated_at'>): BlueprintAgent {
    ensureBlueprintsDir();
    const id = `bp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    const blueprint: BlueprintAgent = { ...data, id, created_at: now, updated_at: now };
    fs.mkdirSync(blueprintDir(id), { recursive: true });
    fs.writeFileSync(configPath(id), JSON.stringify(blueprint, null, 2) + '\n');
    fs.writeFileSync(promptPath(id), '');
    return blueprint;
}

export function updateBlueprint(id: string, data: Partial<Omit<BlueprintAgent, 'id' | 'created_at'>>): BlueprintAgent | null {
    const existing = getBlueprint(id);
    if (!existing) return null;
    const updated: BlueprintAgent = { ...existing, ...data, id, updated_at: Date.now() };
    fs.writeFileSync(configPath(id), JSON.stringify(updated, null, 2) + '\n');
    return updated;
}

export function setBlueprintSystemPrompt(id: string, content: string): boolean {
    if (!getBlueprint(id)) return false;
    fs.writeFileSync(promptPath(id), content);
    // bump updated_at
    updateBlueprint(id, {});
    return true;
}

export function deleteBlueprint(id: string): boolean {
    const dir = blueprintDir(id);
    if (!fs.existsSync(dir)) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
}
