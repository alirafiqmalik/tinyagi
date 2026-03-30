"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  updateProject, type Project, type AgentConfig, type TeamConfig,
  type ProjectTeam, type ProjectAgent,
} from "@/lib/api";
import { Users, Bot, Plus, Pencil, Trash2, Loader2 } from "lucide-react";

interface Props {
  project: Project;
  agents: Record<string, AgentConfig>;
  teams: Record<string, TeamConfig>;
  onUpdated: (updated: Project) => void;
}

export function AgentsTab({ project, agents, teams, onUpdated }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Team role editor state
  const [editTeam, setEditTeam] = useState<ProjectTeam | null>(null);
  const [editAgent, setEditAgent] = useState<ProjectAgent | null>(null);

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

  // ── Team assignment ──

  function addTeam(teamId: string) {
    if (project.assigned_teams.some(t => t.team_id === teamId)) return;
    save({ assigned_teams: [...project.assigned_teams, { team_id: teamId, role_tag: "", role_description: "" }] });
  }

  function removeTeam(teamId: string) {
    save({ assigned_teams: project.assigned_teams.filter(t => t.team_id !== teamId) });
  }

  function saveTeamRole(updated: ProjectTeam) {
    save({
      assigned_teams: project.assigned_teams.map(t =>
        t.team_id === updated.team_id ? updated : t
      ),
    });
    setEditTeam(null);
  }

  // ── Agent assignment ──

  function addAgent(agentId: string) {
    if (project.assigned_agents.some(a => a.agent_id === agentId)) return;
    save({ assigned_agents: [...project.assigned_agents, { agent_id: agentId }] });
  }

  function removeAgent(agentId: string) {
    save({ assigned_agents: project.assigned_agents.filter(a => a.agent_id !== agentId) });
  }

  function saveAgentRole(updated: ProjectAgent) {
    save({
      assigned_agents: project.assigned_agents.map(a =>
        a.agent_id === updated.agent_id ? updated : a
      ),
    });
    setEditAgent(null);
  }

  const unassignedTeams = Object.keys(teams).filter(id => !project.assigned_teams.some(t => t.team_id === id));
  const unassignedAgents = Object.keys(agents).filter(id => !project.assigned_agents.some(a => a.agent_id === id));

  return (
    <div className="p-6 max-w-3xl space-y-8">
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* ── Assigned Teams ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            Assigned Teams
          </h3>
          {unassignedTeams.length > 0 && (
            <Select onValueChange={addTeam} disabled={saving}>
              <SelectTrigger className="w-52 h-8 text-sm">
                <SelectValue placeholder="+ Assign team..." />
              </SelectTrigger>
              <SelectContent>
                {unassignedTeams.map(id => (
                  <SelectItem key={id} value={id}>{teams[id].name} (@{id})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {project.assigned_teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teams assigned. Select a team above to assign it to this project.</p>
        ) : (
          <div className="space-y-2">
            {project.assigned_teams.map(pt => {
              const team = teams[pt.team_id];
              return (
                <div key={pt.team_id} className="flex items-center justify-between border rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{team?.name ?? pt.team_id}</p>
                    {pt.role_tag && <Badge variant="outline" className="text-xs mt-1">{pt.role_tag}</Badge>}
                    {pt.role_description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{pt.role_description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditTeam(pt)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeTeam(pt.team_id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Assigned Agents ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium flex items-center gap-2">
            <Bot className="h-4 w-4 text-green-500" />
            Assigned Agents
          </h3>
          {unassignedAgents.length > 0 && (
            <Select onValueChange={addAgent} disabled={saving}>
              <SelectTrigger className="w-52 h-8 text-sm">
                <SelectValue placeholder="+ Assign agent..." />
              </SelectTrigger>
              <SelectContent>
                {unassignedAgents.map(id => (
                  <SelectItem key={id} value={id}>{agents[id].name} (@{id})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {project.assigned_agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agents assigned directly. Agents in assigned teams are included automatically.</p>
        ) : (
          <div className="space-y-2">
            {project.assigned_agents.map(pa => {
              const agent = agents[pa.agent_id];
              return (
                <div key={pa.agent_id} className="flex items-center justify-between border rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{agent?.name ?? pa.agent_id}</p>
                    {pa.role_tag && <Badge variant="outline" className="text-xs mt-1">{pa.role_tag}</Badge>}
                    {pa.role_description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{pa.role_description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditAgent(pa)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeAgent(pa.agent_id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {saving && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
        </div>
      )}

      {/* ── Edit Team Role Dialog ── */}
      <Dialog open={!!editTeam} onOpenChange={(open: boolean) => { if (!open) setEditTeam(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Team Role in Project</DialogTitle>
          </DialogHeader>
          {editTeam && (
            <TeamRoleForm
              pt={editTeam}
              onSave={saveTeamRole}
              onCancel={() => setEditTeam(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Agent Role Dialog ── */}
      <Dialog open={!!editAgent} onOpenChange={(open: boolean) => { if (!open) setEditAgent(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agent Role in Project</DialogTitle>
          </DialogHeader>
          {editAgent && (
            <AgentRoleForm
              pa={editAgent}
              onSave={saveAgentRole}
              onCancel={() => setEditAgent(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamRoleForm({ pt, onSave, onCancel }: { pt: ProjectTeam; onSave: (pt: ProjectTeam) => void; onCancel: () => void }) {
  const [roleTag, setRoleTag] = useState(pt.role_tag);
  const [roleDesc, setRoleDesc] = useState(pt.role_description ?? "");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Role Tag</Label>
        <Input value={roleTag} onChange={e => setRoleTag(e.target.value)} placeholder="e.g. Backend Development" />
      </div>
      <div className="space-y-1.5">
        <Label>Role Description</Label>
        <Textarea value={roleDesc} onChange={e => setRoleDesc(e.target.value)} rows={4} placeholder="Describe this team's role and responsibilities in this project..." />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave({ ...pt, role_tag: roleTag, role_description: roleDesc })}>Save</Button>
      </div>
    </div>
  );
}

function AgentRoleForm({ pa, onSave, onCancel }: { pa: ProjectAgent; onSave: (pa: ProjectAgent) => void; onCancel: () => void }) {
  const [roleTag, setRoleTag] = useState(pa.role_tag ?? "");
  const [roleDesc, setRoleDesc] = useState(pa.role_description ?? "");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Role Tag</Label>
        <Input value={roleTag} onChange={e => setRoleTag(e.target.value)} placeholder="e.g. Lead Developer" />
      </div>
      <div className="space-y-1.5">
        <Label>Role Description</Label>
        <Textarea value={roleDesc} onChange={e => setRoleDesc(e.target.value)} rows={4} placeholder="Describe this agent's role in this project..." />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave({ ...pa, role_tag: roleTag, role_description: roleDesc })}>Save</Button>
      </div>
    </div>
  );
}
