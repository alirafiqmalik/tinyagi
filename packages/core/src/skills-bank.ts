/**
 * Skills Bank — flat directory of skills at ~/.tinyagi/skills-bank/<skill-id>/SKILL.md
 *
 * Access control is per-context:
 *   Effective skills = Blueprint.skills ∪ Team.team_skills ∪ Project.skills
 * A null/undefined skills list on an entity means "no filter" (inherit all from parent context).
 */

import fs from 'fs';
import path from 'path';
import { getSkillsBankDir, getWorkspaceSkillsDir } from './config';
import { getSettings } from './config';

export interface BankSkill {
    id: string;
    name: string;
    description: string;
}

function ensureSkillsBankDir(): void {
    fs.mkdirSync(getSkillsBankDir(), { recursive: true });
}

/**
 * List all skills in the bank.
 */
export function listSkillsBank(): BankSkill[] {
    ensureSkillsBankDir();
    const bankDir = getSkillsBankDir();
    const entries = fs.readdirSync(bankDir, { withFileTypes: true });
    const skills: BankSkill[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillFile = path.join(bankDir, entry.name, 'SKILL.md');
        if (!fs.existsSync(skillFile)) continue;
        const content = fs.readFileSync(skillFile, 'utf8');
        const firstLine = content.split('\n').find(l => l.trim()) || '';
        const name = firstLine.replace(/^#+\s*/, '') || entry.name;
        const descLine = content.split('\n').slice(1).find(l => l.trim()) || '';
        skills.push({ id: entry.name, name, description: descLine });
    }
    return skills.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Get the SKILL.md content for a specific skill.
 */
export function getSkillContent(id: string): string | null {
    const skillFile = path.join(getSkillsBankDir(), id, 'SKILL.md');
    if (!fs.existsSync(skillFile)) return null;
    return fs.readFileSync(skillFile, 'utf8');
}

/**
 * Resolve the effective skill IDs given access lists from multiple levels.
 * Pass null/undefined for a level to mean "no restriction from this level".
 * Returns the intersection of all non-null levels, or 'all' if every level is unrestricted.
 */
export function resolveEffectiveSkills(
    agentSkills?: string[] | 'all' | 'none' | null,
    teamSkills?: string[] | null,
    projectSkills?: string[] | null,
): string[] | 'all' | 'none' {
    if (agentSkills === 'none') return 'none';

    const allBankIds = listSkillsBank().map(s => s.id);

    // Start with agent skills (or all bank skills if unrestricted)
    let effective: Set<string>;
    if (!agentSkills || agentSkills === 'all') {
        effective = new Set(allBankIds);
    } else {
        effective = new Set(agentSkills as string[]);
    }

    // Union with team skills
    if (teamSkills && teamSkills.length > 0) {
        for (const s of teamSkills) effective.add(s);
    }

    // Union with project skills
    if (projectSkills && projectSkills.length > 0) {
        for (const s of projectSkills) effective.add(s);
    }

    const result = [...effective].filter(id => allBankIds.includes(id));
    if (result.length === allBankIds.length) return 'all';
    return result;
}

/**
 * Migrate workspace skills to the bank.
 * Copies any skills from the legacy workspace/skills dir that aren't already in the bank.
 */
export function migrateWorkspaceSkillsToBank(): { migrated: string[]; skipped: string[] } {
    const settings = getSettings();
    const legacyDir = getWorkspaceSkillsDir(settings);
    const bankDir = getSkillsBankDir();
    ensureSkillsBankDir();

    const migrated: string[] = [];
    const skipped: string[] = [];

    if (!fs.existsSync(legacyDir)) return { migrated, skipped };

    const entries = fs.readdirSync(legacyDir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const src = path.join(legacyDir, entry.name);
        const dst = path.join(bankDir, entry.name);
        if (fs.existsSync(dst)) {
            skipped.push(entry.name);
            continue;
        }
        fs.cpSync(src, dst, { recursive: true });
        migrated.push(entry.name);
    }

    return { migrated, skipped };
}
