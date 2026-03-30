"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  updateProject, getSkillsBank, type Project, type AgentConfig, type TeamConfig,
  type BankSkill, type ProjectTeam,
} from "@/lib/api";
import { SkillsBankPicker } from "@/components/shared/skills-bank-picker";
import { usePolling } from "@/lib/hooks";
import {
  FolderOpen, Bot, Users, Pencil, Lock, Globe, HardDrive, Loader2, Save,
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface WorkspaceTabProps {
  project: Project;
  agents: Record<string, AgentConfig>;
  teams: Record<string, TeamConfig>;
  onUpdated: (updated: Project) => void;
}

export function WorkspaceTab({ project, agents, teams, onUpdated }: WorkspaceTabProps) {
  const { data: bankSkills } = usePolling<BankSkill[]>(getSkillsBank, 0);
  const [projectSkills, setProjectSkills] = useState<string[]>(project.skills ?? []);
  const [skillsSaving, setSkillsSaving] = useState(false);

  const [editTeamRole, setEditTeamRole] = useState<ProjectTeam | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(patch: Partial<Project>) {
    setSaving(true);
    setError("");
    try {
      const res = await updateProject(project.id, patch);
      onUpdated(res.project);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveSkills() {
    setSkillsSaving(true);
    try {
      const res = await updateProject(project.id, { skills: projectSkills });
      onUpdated(res.project);
    } finally {
      setSkillsSaving(false);
    }
  }

  function saveTeamRole(updated: ProjectTeam) {
    save({
      assigned_teams: project.assigned_teams.map(t =>
        t.team_id === updated.team_id ? updated : t
      ),
    });
    setEditTeamRole(null);
  }

  const skillsDirty = JSON.stringify(projectSkills.sort()) !== JSON.stringify([...(project.skills ?? [])].sort());

  return (
    <div className="p-6 max-w-4xl space-y-8">
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* ── Teams & Directories table ── */}
      <section className="space-y-3">
        <h3 className="font-medium flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-500" />
          Teams &amp; Work Directories
        </h3>

        {project.assigned_teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teams assigned. Go to the Agents tab to assign teams.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Team</th>
                  <th className="px-4 py-2 text-left font-medium">Work Dir</th>
                  <th className="px-4 py-2 text-left font-medium">Role in Project</th>
                  <th className="px-4 py-2 text-left font-medium">Members</th>
                  <th className="px-4 py-2 text-left font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {project.assigned_teams.map(pt => {
                  const team = teams[pt.team_id];
                  return (
                    <tr key={pt.team_id} className="border-t">
                      <td className="px-4 py-3">
                        <p className="font-medium">{team?.name ?? pt.team_id}</p>
                        <p className="text-xs text-muted-foreground font-mono">@{pt.team_id}</p>
                      </td>
                      <td className="px-4 py-3">
                        {team?.working_directory ? (
                          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate max-w-[180px]">{team.working_directory}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {pt.role_tag
                          ? <Badge variant="outline" className="text-xs">{pt.role_tag}</Badge>
                          : <span className="text-xs text-muted-foreground/50">No role</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">
                          {team?.members?.length ?? 0} agent{(team?.members?.length ?? 0) !== 1 ? "s" : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditTeamRole(pt)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Standalone Agents table ── */}
      {project.assigned_agents.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-medium flex items-center gap-2">
            <Bot className="h-4 w-4 text-green-500" />
            Standalone Agents
          </h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Agent</th>
                  <th className="px-4 py-2 text-left font-medium">Work Dir</th>
                  <th className="px-4 py-2 text-left font-medium">Role</th>
                  <th className="px-4 py-2 text-left font-medium">Permissions</th>
                </tr>
              </thead>
              <tbody>
                {project.assigned_agents.map(pa => {
                  const agent = agents[pa.agent_id];
                  return (
                    <tr key={pa.agent_id} className="border-t">
                      <td className="px-4 py-3">
                        <p className="font-medium">{agent?.name ?? pa.agent_id}</p>
                        <p className="text-xs text-muted-foreground font-mono">@{pa.agent_id}</p>
                      </td>
                      <td className="px-4 py-3">
                        {agent?.working_directory ? (
                          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate max-w-[160px]">{agent.working_directory}</span>
                          </div>
                        ) : <span className="text-xs text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {pa.role_tag
                          ? <Badge variant="outline" className="text-xs">{pa.role_tag}</Badge>
                          : <span className="text-xs text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {agent?.permissions && (
                            <>
                              <Badge variant="secondary" className="text-[10px] gap-0.5">
                                <HardDrive className="h-2.5 w-2.5" />
                                {agent.permissions.filesystem}
                              </Badge>
                              {agent.permissions.browser && (
                                <Badge variant="secondary" className="text-[10px]">browser</Badge>
                              )}
                              {agent.permissions.network && (
                                <Badge variant="secondary" className="text-[10px] gap-0.5">
                                  <Globe className="h-2.5 w-2.5" />
                                  network
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-[10px] gap-0.5">
                                <Lock className="h-2.5 w-2.5" />
                                {agent.permissions.sandbox_mode}
                              </Badge>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Project Skills ── */}
      <section className="space-y-3">
        <h3 className="font-medium">Project Skills</h3>
        <p className="text-xs text-muted-foreground">
          These skills are available to all teams and agents working on this project (unioned with their own skills).
        </p>
        <SkillsBankPicker
          available={bankSkills ?? []}
          selected={projectSkills}
          onChange={setProjectSkills}
        />
        <Button size="sm" onClick={saveSkills} disabled={!skillsDirty || skillsSaving}>
          {skillsSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Skills
        </Button>
      </section>

      {saving && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
        </div>
      )}

      {/* ── Edit Team Role Dialog ── */}
      <Dialog open={!!editTeamRole} onOpenChange={(open: boolean) => { if (!open) setEditTeamRole(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Team Role in Project</DialogTitle>
          </DialogHeader>
          {editTeamRole && (
            <TeamRoleInlineForm
              pt={editTeamRole}
              onSave={saveTeamRole}
              onCancel={() => setEditTeamRole(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamRoleInlineForm({ pt, onSave, onCancel }: { pt: ProjectTeam; onSave: (pt: ProjectTeam) => void; onCancel: () => void }) {
  const [roleTag, setRoleTag] = useState(pt.role_tag);
  const [roleDesc, setRoleDesc] = useState(pt.role_description ?? "");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Role Tag</Label>
        <Input value={roleTag} onChange={e => setRoleTag(e.target.value)} placeholder="e.g. Backend Development" />
      </div>
      <div className="space-y-1.5">
        <Label>Role Description (injected into prompt)</Label>
        <Textarea value={roleDesc} onChange={e => setRoleDesc(e.target.value)} rows={4}
          placeholder="Describe this team's role and responsibilities in this project..." />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave({ ...pt, role_tag: roleTag, role_description: roleDesc })}>Save</Button>
      </div>
    </div>
  );
}
