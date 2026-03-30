"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateProject, type Project } from "@/lib/api";
import { Save, Loader2 } from "lucide-react";

interface Props {
  project: Project;
  onUpdated: (updated: Project) => void;
}

export function OverviewTab({ project, onUpdated }: Props) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [contextPrompt, setContextPrompt] = useState(project.context_prompt ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await updateProject(project.id, { name, description, context_prompt: contextPrompt });
      onUpdated(res.project);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    name !== project.name ||
    description !== project.description ||
    contextPrompt !== (project.context_prompt ?? "");

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div className="space-y-1.5">
        <Label>Project Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="What is this project about?"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Context Prompt</Label>
        <p className="text-xs text-muted-foreground">
          Injected at the top of every agent&apos;s system prompt when working on tasks in this project.
        </p>
        <Textarea
          value={contextPrompt}
          onChange={e => setContextPrompt(e.target.value)}
          rows={6}
          className="font-mono text-sm"
          placeholder="e.g. You are working on the API Rewrite project. Goal: migrate from Express to Hono with full type safety..."
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Status: <strong>{project.status}</strong></span>
        <span>•</span>
        <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button onClick={handleSave} disabled={saving || !dirty}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saved ? "Saved!" : "Save Changes"}
      </Button>
    </div>
  );
}
