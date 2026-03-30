"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BlueprintAgent,
  ModelDefinition,
  BankSkill,
  createBlueprint,
  updateBlueprint,
  getBlueprintSystemPrompt,
  saveBlueprintSystemPrompt,
  getModels,
  getSkillsBank,
} from "@/lib/api";
import { SkillsBankPicker } from "@/components/shared/skills-bank-picker";

interface Props {
  blueprint?: BlueprintAgent;
  onSaved: (bp: BlueprintAgent) => void;
  onCancel: () => void;
}

export function BlueprintEditor({ blueprint, onSaved, onCancel }: Props) {
  const isNew = !blueprint;

  const [name, setName] = useState(blueprint?.name ?? "");
  const [provider, setProvider] = useState(blueprint?.provider ?? "anthropic");
  const [model, setModel] = useState(blueprint?.model ?? "");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [skills, setSkills] = useState<string[]>(blueprint?.skills ?? []);
  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [bankSkills, setBankSkills] = useState<BankSkill[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getModels().then(r => setModels(r.models)).catch(() => {});
    getSkillsBank().then(setBankSkills).catch(() => {});
    if (blueprint) {
      getBlueprintSystemPrompt(blueprint.id)
        .then(r => setSystemPrompt(r.system_prompt))
        .catch(() => {});
    }
  }, [blueprint]);

  const providers = [...new Set(models.map(m => m.vendor))];
  const filteredModels = models.filter(m => m.vendor === provider);

  async function handleSave() {
    if (!name.trim() || !provider || !model) {
      setError("Name, provider, and model are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let bp: BlueprintAgent;
      if (isNew) {
        const res = await createBlueprint({ name, provider, model, skills });
        bp = res.blueprint;
      } else {
        const res = await updateBlueprint(blueprint!.id, { name, provider, model, skills });
        bp = res.blueprint;
      }
      await saveBlueprintSystemPrompt(bp.id, systemPrompt);
      onSaved(bp);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Senior Coder" />
        </div>
        <div className="space-y-1">
          <Label>Provider</Label>
          <Select value={provider} onValueChange={v => { setProvider(v); setModel(""); }}>
            <SelectTrigger>
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.length > 0
                ? providers.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)
                : ["anthropic", "openai", "opencode"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)
              }
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Model</Label>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger>
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {filteredModels.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>System Prompt</Label>
        <Textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          placeholder="Describe this agent's identity, expertise, and behavior..."
          rows={8}
          className="font-mono text-sm"
        />
      </div>

      <div className="space-y-1">
        <Label>Skills</Label>
        <SkillsBankPicker
          available={bankSkills}
          selected={skills}
          onChange={setSkills}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : isNew ? "Create Blueprint" : "Save Blueprint"}
        </Button>
      </div>
    </div>
  );
}
