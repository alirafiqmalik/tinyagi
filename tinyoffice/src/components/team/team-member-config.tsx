"use client";

import { TeamMember, TeamMemberPermissions, DEFAULT_TEAM_MEMBER_PERMISSIONS, BlueprintAgent, BankSkill } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Trash2 } from "lucide-react";
import { SkillsBankPicker } from "@/components/shared/skills-bank-picker";

interface Props {
  member: TeamMember;
  blueprint: BlueprintAgent | undefined;
  isLeader: boolean;
  bankSkills: BankSkill[];
  onChange: (updated: TeamMember) => void;
  onRemove: () => void;
  onSetLeader: () => void;
}

export function TeamMemberConfig({ member, blueprint, isLeader, bankSkills, onChange, onRemove, onSetLeader }: Props) {
  function patchPermissions(patch: Partial<TeamMemberPermissions>) {
    onChange({ ...member, permissions: { ...member.permissions, ...patch } });
  }

  const skillsValue = Array.isArray(member.permissions.skills) ? member.permissions.skills : [];

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm">{blueprint?.name ?? member.agent_id}</p>
          {isLeader && <Badge variant="default" className="text-xs flex items-center gap-1"><Crown className="h-3 w-3" /> Leader</Badge>}
        </div>
        <div className="flex gap-1">
          {!isLeader && (
            <Button size="sm" variant="outline" onClick={onSetLeader} className="h-7 text-xs">
              Set Leader
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Role Tag</Label>
          <Input
            className="h-8 text-sm"
            value={member.role_tag}
            onChange={e => onChange({ ...member, role_tag: e.target.value })}
            placeholder="e.g. Coder, Reviewer"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Filesystem</Label>
          <Select
            value={member.permissions.filesystem}
            onValueChange={v => patchPermissions({ filesystem: v as TeamMemberPermissions["filesystem"] })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="write">Write</SelectItem>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Role Prompt</Label>
        <Textarea
          className="text-sm"
          rows={2}
          value={member.role_prompt ?? ""}
          onChange={e => onChange({ ...member, role_prompt: e.target.value })}
          placeholder="Describe this agent's role in the team..."
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Switch
            checked={member.permissions.browser}
            onCheckedChange={v => patchPermissions({ browser: v })}
          />
          <Label className="text-xs">Browser</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={member.permissions.network}
            onCheckedChange={v => patchPermissions({ network: v })}
          />
          <Label className="text-xs">Network</Label>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Sandbox</Label>
          <Select
            value={member.permissions.sandbox_mode}
            onValueChange={v => patchPermissions({ sandbox_mode: v as TeamMemberPermissions["sandbox_mode"] })}
          >
            <SelectTrigger className="h-7 text-xs w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">Full</SelectItem>
              <SelectItem value="restricted">Restricted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Skills Access</Label>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={member.permissions.skills === "all" ? "default" : "outline"}
              className="h-6 text-xs"
              onClick={() => patchPermissions({ skills: "all" })}
            >All</Button>
            <Button
              size="sm"
              variant={member.permissions.skills === "none" ? "default" : "outline"}
              className="h-6 text-xs"
              onClick={() => patchPermissions({ skills: "none" })}
            >None</Button>
            <Button
              size="sm"
              variant={Array.isArray(member.permissions.skills) ? "default" : "outline"}
              className="h-6 text-xs"
              onClick={() => patchPermissions({ skills: skillsValue })}
            >Custom</Button>
          </div>
        </div>
        {Array.isArray(member.permissions.skills) && (
          <SkillsBankPicker
            available={bankSkills}
            selected={skillsValue}
            onChange={v => patchPermissions({ skills: v })}
          />
        )}
      </div>
    </div>
  );
}
