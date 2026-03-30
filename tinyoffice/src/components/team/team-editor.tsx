"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TeamConfig,
  TeamMember,
  DEFAULT_TEAM_MEMBER_PERMISSIONS,
  BlueprintAgent,
  BankSkill,
  saveTeam,
  getBlueprints,
  getSkillsBank,
} from "@/lib/api";
import { TeamMemberConfig } from "./team-member-config";
import { SkillsBankPicker } from "@/components/shared/skills-bank-picker";
import { Plus } from "lucide-react";

interface Props {
  teamId: string;
  initial?: TeamConfig;
  onSaved: (id: string, team: TeamConfig) => void;
  onCancel: () => void;
}

export function TeamEditor({ teamId, initial, onSaved, onCancel }: Props) {
  const isNew = !initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [teamPrompt, setTeamPrompt] = useState(initial?.team_prompt ?? "");
  const [workingDirectory, setWorkingDirectory] = useState(initial?.working_directory ?? "");
  const [members, setMembers] = useState<TeamMember[]>(initial?.members ?? []);
  const [leaderAgent, setLeaderAgent] = useState(initial?.leader_agent ?? "");
  const [teamSkills, setTeamSkills] = useState<string[]>(initial?.team_skills ?? []);

  const [blueprints, setBlueprints] = useState<BlueprintAgent[]>([]);
  const [bankSkills, setBankSkills] = useState<BankSkill[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getBlueprints().then(setBlueprints).catch(() => {});
    getSkillsBank().then(setBankSkills).catch(() => {});
  }, []);

  function addMember(agentId: string) {
    if (members.some(m => m.agent_id === agentId)) return;
    const newMember: TeamMember = {
      agent_id: agentId,
      role_tag: "",
      role_prompt: "",
      permissions: { ...DEFAULT_TEAM_MEMBER_PERMISSIONS },
    };
    const updated = [...members, newMember];
    setMembers(updated);
    if (!leaderAgent) setLeaderAgent(agentId);
  }

  function updateMember(idx: number, updated: TeamMember) {
    const next = [...members];
    next[idx] = updated;
    setMembers(next);
  }

  function removeMember(idx: number) {
    const next = members.filter((_, i) => i !== idx);
    setMembers(next);
    if (leaderAgent === members[idx].agent_id) {
      setLeaderAgent(next[0]?.agent_id ?? "");
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Team name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const team: TeamConfig = {
        name,
        team_prompt: teamPrompt || undefined,
        working_directory: workingDirectory || undefined,
        members,
        leader_agent: leaderAgent,
        team_skills: teamSkills,
      };
      const res = await saveTeam(teamId, team);
      onSaved(teamId, res.team);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const unaddedBlueprints = blueprints.filter(bp => !members.some(m => m.agent_id === bp.id));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Team Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Backend Team" />
        </div>
        <div className="space-y-1">
          <Label>Work Directory</Label>
          <Input value={workingDirectory} onChange={e => setWorkingDirectory(e.target.value)} placeholder="/path/to/workdir (optional)" />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Team Prompt</Label>
        <Textarea
          value={teamPrompt}
          onChange={e => setTeamPrompt(e.target.value)}
          placeholder="Describe this team's mission and how agents should collaborate..."
          rows={3}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Team Members</Label>
          {unaddedBlueprints.length > 0 && (
            <Select onValueChange={addMember}>
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue placeholder="Add blueprint agent..." />
              </SelectTrigger>
              <SelectContent>
                {unaddedBlueprints.map(bp => (
                  <SelectItem key={bp.id} value={bp.id}>{bp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {unaddedBlueprints.length === 0 && blueprints.length > 0 && (
            <p className="text-xs text-muted-foreground">All blueprints added</p>
          )}
          {blueprints.length === 0 && (
            <p className="text-xs text-muted-foreground">No blueprints — create some first</p>
          )}
        </div>

        {members.length === 0 && (
          <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
            <Plus className="mx-auto h-6 w-6 mb-1 opacity-40" />
            Add blueprint agents to build your team
          </div>
        )}

        {members.map((member, idx) => (
          <TeamMemberConfig
            key={member.agent_id}
            member={member}
            blueprint={blueprints.find(bp => bp.id === member.agent_id)}
            isLeader={leaderAgent === member.agent_id}
            bankSkills={bankSkills}
            onChange={updated => updateMember(idx, updated)}
            onRemove={() => removeMember(idx)}
            onSetLeader={() => setLeaderAgent(member.agent_id)}
          />
        ))}
      </div>

      <div className="space-y-1">
        <Label>Team Skills</Label>
        <SkillsBankPicker
          available={bankSkills}
          selected={teamSkills}
          onChange={setTeamSkills}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : isNew ? "Create Team" : "Save Team"}
        </Button>
      </div>
    </div>
  );
}
