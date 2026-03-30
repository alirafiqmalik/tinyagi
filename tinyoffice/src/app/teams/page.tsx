"use client";

import { useState, useCallback } from "react";
import { usePolling } from "@/lib/hooks";
import {
  getAgents, getTeams, getBlueprints,
  saveTeam, deleteTeam, createBlueprint, updateBlueprint, deleteBlueprint, copyAgentToBlueprint,
  type AgentConfig, type TeamConfig, type TeamMember, type BlueprintAgent,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, Crown, Bot, Plus, Pencil, Trash2,
  Loader2, Copy, Cpu, FolderOpen,
} from "lucide-react";
import { BlueprintCard } from "@/components/team/blueprint-card";
import { BlueprintEditor } from "@/components/team/blueprint-editor";
import { TeamEditor } from "@/components/team/team-editor";

export default function TeamsPage() {
  const { data: agents } = usePolling<Record<string, AgentConfig>>(getAgents, 0);
  const { data: teams, loading: teamsLoading, refresh: refreshTeams } = usePolling<Record<string, TeamConfig>>(getTeams, 0);
  const { data: blueprints, refresh: refreshBlueprints } = usePolling<BlueprintAgent[]>(getBlueprints, 0);

  // Blueprint modal state
  const [bpModal, setBpModal] = useState<{ mode: "new" | "edit"; blueprint?: BlueprintAgent } | null>(null);
  const [copyFromAgent, setCopyFromAgent] = useState("");
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyError, setCopyError] = useState("");

  // Team editor state
  const [teamModal, setTeamModal] = useState<{ teamId: string; team?: TeamConfig } | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<string | null>(null);

  // ── Blueprint actions ──

  const handleBpSaved = useCallback((_bp: BlueprintAgent) => {
    refreshBlueprints();
    setBpModal(null);
  }, [refreshBlueprints]);

  const handleBpDelete = useCallback(async (id: string) => {
    await deleteBlueprint(id);
    refreshBlueprints();
  }, [refreshBlueprints]);

  const handleCopyFromAgent = useCallback(async () => {
    if (!copyFromAgent) return;
    setCopyLoading(true);
    setCopyError("");
    try {
      await copyAgentToBlueprint(copyFromAgent);
      refreshBlueprints();
      setCopyFromAgent("");
    } catch (e: unknown) {
      setCopyError((e as Error).message);
    } finally {
      setCopyLoading(false);
    }
  }, [copyFromAgent, refreshBlueprints]);

  // ── Team actions ──

  const handleTeamSaved = useCallback((_id: string, _team: TeamConfig) => {
    refreshTeams();
    setTeamModal(null);
  }, [refreshTeams]);

  const handleTeamDelete = useCallback(async (id: string) => {
    setDeletingTeam(id);
    try {
      await deleteTeam(id);
      refreshTeams();
    } finally {
      setDeletingTeam(null);
    }
  }, [refreshTeams]);

  const agentList = Object.entries(agents || {});
  const bpList = blueprints ?? [];
  const teamList = Object.entries(teams || {});

  return (
    <div className="p-8 space-y-10">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Teams
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Blueprint Agents define agent identities; Teams assemble them with roles and permissions.
        </p>
      </div>

      {/* ── Blueprint Agents Section ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Cpu className="h-4 w-4 text-purple-500" />
              Blueprint Agents
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reusable agent templates — define identity, model, and skills. Add to teams for execution.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setBpModal({ mode: "new" })}>
              <Plus className="h-3.5 w-3.5" /> New Blueprint
            </Button>
          </div>
        </div>

        {/* Copy from task agent */}
        {agentList.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value={copyFromAgent} onValueChange={setCopyFromAgent}>
              <SelectTrigger className="w-56 h-8 text-sm">
                <SelectValue placeholder="Copy from Task Agent..." />
              </SelectTrigger>
              <SelectContent>
                {agentList.map(([id, a]) => (
                  <SelectItem key={id} value={id}>{a.name} (@{id})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={handleCopyFromAgent} disabled={!copyFromAgent || copyLoading} className="h-8">
              {copyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
              Copy as Blueprint
            </Button>
            {copyError && <p className="text-xs text-red-500">{copyError}</p>}
          </div>
        )}

        {bpList.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Cpu className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">No blueprints yet — create one to define an agent identity for your teams.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {bpList.map(bp => (
              <BlueprintCard
                key={bp.id}
                blueprint={bp}
                onEdit={() => setBpModal({ mode: "edit", blueprint: bp })}
                onDelete={() => handleBpDelete(bp.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Teams Section ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Teams
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Assemble blueprints into teams with roles, permissions, and a shared work directory.
            </p>
          </div>
          <Button size="sm" onClick={() => {
            const id = `team-${Date.now()}`;
            setTeamModal({ teamId: id });
          }}>
            <Plus className="h-3.5 w-3.5" /> Add Team
          </Button>
        </div>

        {teamsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading teams...
          </div>
        ) : teamList.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">No teams yet — click &quot;Add Team&quot; to create one.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {teamList.map(([id, team]) => (
              <TeamCard
                key={id}
                id={id}
                team={team}
                blueprints={bpList}
                onEdit={() => setTeamModal({ teamId: id, team })}
                onDelete={() => handleTeamDelete(id)}
                deleting={deletingTeam === id}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── How it works ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How Team Collaboration Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 items-center justify-center bg-primary/10 text-primary text-xs font-bold shrink-0">1</div>
            <p>Messages sent to <code className="bg-muted px-1 py-0.5 font-mono">@team_id</code> are routed to the team leader agent.</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 items-center justify-center bg-primary/10 text-primary text-xs font-bold shrink-0">2</div>
            <p>The leader can delegate to teammates using <code className="bg-muted px-1 py-0.5 font-mono">[@teammate: message]</code> tags.</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 items-center justify-center bg-primary/10 text-primary text-xs font-bold shrink-0">3</div>
            <p>Each agent&apos;s effective prompt is assembled from project context → team context → agent identity.</p>
          </div>
        </CardContent>
      </Card>

      {/* ── Blueprint Editor Modal ── */}
      <Dialog open={!!bpModal} onOpenChange={(open: boolean) => { if (!open) setBpModal(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{bpModal?.mode === "new" ? "New Blueprint Agent" : "Edit Blueprint Agent"}</DialogTitle>
          </DialogHeader>
          {bpModal && (
            <BlueprintEditor
              blueprint={bpModal.blueprint}
              onSaved={handleBpSaved}
              onCancel={() => setBpModal(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Team Editor Modal ── */}
      <Dialog open={!!teamModal} onOpenChange={(open: boolean) => { if (!open) setTeamModal(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{teamModal?.team ? `Edit Team: ${teamModal.team.name}` : "New Team"}</DialogTitle>
          </DialogHeader>
          {teamModal && (
            <TeamEditor
              teamId={teamModal.teamId}
              initial={teamModal.team}
              onSaved={handleTeamSaved}
              onCancel={() => setTeamModal(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamCard({
  id, team, blueprints, onEdit, onDelete, deleting,
}: {
  id: string;
  team: TeamConfig;
  blueprints: BlueprintAgent[];
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Card className="transition-colors hover:border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{team.name}</CardTitle>
            <CardDescription className="font-mono text-xs">@{id}</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs">
              {team.members?.length ?? 0} member{(team.members?.length ?? 0) !== 1 ? "s" : ""}
            </Badge>
            <Button variant="ghost" size="icon" onClick={onEdit} className="h-8 w-8">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button variant="destructive" size="sm" onClick={() => { onDelete(); setConfirmDelete(false); }} disabled={deleting} className="h-7 text-xs">
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} className="h-7 text-xs">Cancel</Button>
              </div>
            ) : (
              <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {team.working_directory && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FolderOpen className="h-3.5 w-3.5" />
            <code className="font-mono">{team.working_directory}</code>
          </div>
        )}
        {team.team_prompt && (
          <p className="text-xs text-muted-foreground line-clamp-2">{team.team_prompt}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {(team.members ?? []).map(member => {
            const bp = blueprints.find(b => b.id === member.agent_id);
            const isLeader = member.agent_id === team.leader_agent;
            return (
              <div key={member.agent_id} className={`flex items-center gap-1.5 border px-2 py-1.5 rounded text-xs ${isLeader ? "border-primary bg-primary/5" : "border-border"}`}>
                <Bot className={`h-3 w-3 ${isLeader ? "text-primary" : "text-muted-foreground"}`} />
                <span className="font-medium">{bp?.name ?? member.agent_id}</span>
                {isLeader && <Crown className="h-3 w-3 text-primary" />}
                {member.role_tag && <Badge variant="outline" className="text-xs h-4 px-1">{member.role_tag}</Badge>}
              </div>
            );
          })}
        </div>
        {(team.team_skills ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {team.team_skills!.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
