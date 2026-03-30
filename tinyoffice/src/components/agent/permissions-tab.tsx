"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getAgentPermissions,
  updateAgentPermissions,
  type AgentPermissions,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Shield, Save } from "lucide-react";

const DEFAULT_PERMISSIONS: AgentPermissions = {
  filesystem: "write",
  browser: false,
  network: true,
  skills: "all",
  sandbox_mode: "full",
  allowed_directories: [],
};

export function PermissionsTab({ agentId }: { agentId: string }) {
  const [permissions, setPermissions] = useState<AgentPermissions>(DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const perms = await getAgentPermissions(agentId);
        setPermissions(perms);
      } catch {
        // Use defaults
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId]);

  const update = useCallback((patch: Partial<AgentPermissions>) => {
    setPermissions((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateAgentPermissions(agentId, permissions);
      setDirty(false);
    } catch (err: any) {
      alert(err.message || "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  }, [agentId, permissions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Loading permissions...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-lg">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-base font-semibold">Agent Permissions</h3>
      </div>

      {/* Filesystem */}
      <div className="space-y-1.5">
        <Label>Filesystem Access</Label>
        <Select
          value={permissions.filesystem}
          onValueChange={(v) => update({ filesystem: v as AgentPermissions["filesystem"] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="write">Read & Write</SelectItem>
            <SelectItem value="read">Read Only</SelectItem>
            <SelectItem value="none">No Access</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Controls whether the agent can read/write files in its working directory.
        </p>
      </div>

      {/* Browser */}
      <div className="flex items-center justify-between">
        <div>
          <Label>Browser Control</Label>
          <p className="text-[11px] text-muted-foreground">Allow the agent to browse the web.</p>
        </div>
        <Switch
          checked={permissions.browser}
          onCheckedChange={(v) => update({ browser: v })}
        />
      </div>

      {/* Network */}
      <div className="flex items-center justify-between">
        <div>
          <Label>Network Access</Label>
          <p className="text-[11px] text-muted-foreground">Allow the agent to make network requests.</p>
        </div>
        <Switch
          checked={permissions.network}
          onCheckedChange={(v) => update({ network: v })}
        />
      </div>

      {/* Sandbox Mode */}
      <div className="space-y-1.5">
        <Label>Sandbox Mode</Label>
        <Select
          value={permissions.sandbox_mode}
          onValueChange={(v) => update({ sandbox_mode: v as AgentPermissions["sandbox_mode"] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="full">Full Access (skip permission checks)</SelectItem>
            <SelectItem value="restricted">Restricted (enforce permission checks)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          &quot;Full&quot; passes --dangerously-skip-permissions to the CLI. Use &quot;Restricted&quot; for untrusted agents.
        </p>
      </div>

      {/* Skills */}
      <div className="space-y-1.5">
        <Label>Skills Access</Label>
        <Select
          value={typeof permissions.skills === "string" ? permissions.skills : "custom"}
          onValueChange={(v) => {
            if (v === "all" || v === "none") update({ skills: v });
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Available Skills</SelectItem>
            <SelectItem value="none">No Skills</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Save */}
      {dirty && (
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Permissions"}
        </Button>
      )}
    </div>
  );
}
