"use client";

import { useState, useEffect } from "react";
import {
  getModels,
  getDirectories,
  addDirectory,
  createSession,
  type ModelDefinition,
  type AgentPermissions,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, X, FolderOpen } from "lucide-react";

interface NewSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (sessionId: string) => void;
}

const PERMISSION_PRESETS: Record<string, Partial<AgentPermissions>> = {
  full: { filesystem: "write", browser: true, network: true, sandbox_mode: "full", skills: "all" },
  readonly: { filesystem: "read", browser: false, network: true, sandbox_mode: "restricted", skills: "all" },
  sandboxed: { filesystem: "none", browser: false, network: false, sandbox_mode: "restricted", skills: "none" },
};

export function NewSessionDialog({ open, onClose, onCreated }: NewSessionDialogProps) {
  const [models, setModels] = useState<Record<string, ModelDefinition[]>>({});
  const [directories, setDirectories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedDir, setSelectedDir] = useState("");
  const [newDirPath, setNewDirPath] = useState("");
  const [showNewDir, setShowNewDir] = useState(false);
  const [permPreset, setPermPreset] = useState("full");

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [modelData, dirs] = await Promise.all([getModels(), getDirectories()]);
        setModels(modelData.byVendor);
        setDirectories(dirs);
      } catch {}
    })();
  }, [open]);

  if (!open) return null;

  const allModels = Object.values(models).flat();
  const selectedModelDef = allModels.find((m) => m.id === selectedModel);

  // Derive provider from selected model
  function getProviderForModel(model: ModelDefinition): string {
    if (model.vendor.startsWith("custom:")) return model.vendor;
    return model.vendor;
  }

  async function handleAddDir() {
    if (!newDirPath.trim()) return;
    try {
      const result = await addDirectory(newDirPath.trim());
      setDirectories(result.directories);
      setSelectedDir(newDirPath.trim());
      setNewDirPath("");
      setShowNewDir(false);
    } catch (err: any) {
      alert(err.message || "Failed to add directory");
    }
  }

  async function handleCreate() {
    if (!selectedModel || !selectedDir) return;
    setLoading(true);
    try {
      const model = allModels.find((m) => m.id === selectedModel)!;
      const session = await createSession({
        name: name.trim() || undefined,
        provider: getProviderForModel(model),
        model: selectedModel,
        working_directory: selectedDir,
        permissions: PERMISSION_PRESETS[permPreset] as Partial<AgentPermissions>,
      });
      onCreated(session.id);
      onClose();
      // Reset
      setName("");
      setSelectedModel("");
      setSelectedDir("");
      setPermPreset("full");
    } catch (err: any) {
      alert(err.message || "Failed to create session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Agent</h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Name */}
        <div className="space-y-1.5">
          <Label>Name (optional)</Label>
          <Input
            placeholder="Auto-generated from model..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <Label>Model</Label>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger>
              <SelectValue placeholder="Select a model..." />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(models).map(([vendor, vendorModels]) => {
                const vendorLabel = vendor.startsWith("custom:")
                  ? `Custom Provider (${vendor.slice("custom:".length)})`
                  : vendor;
                return (
                  <SelectGroup key={vendor}>
                    <SelectLabel className="capitalize">{vendorLabel}</SelectLabel>
                    {vendorModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.display_name}
                        {m.is_code_agent && " (Code)"}
                        {m.installed === true && " (installed)"}
                        {m.installed === false && " (not installed)"}
                        {m.category === "cloud" && m.available === true && " (available)"}
                        {m.category === "cloud" && m.available === false && " (unavailable)"}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
          {selectedModelDef && (
            <p className="text-[11px] text-muted-foreground">
              {selectedModelDef.capabilities.context_window > 0
                ? `${(selectedModelDef.capabilities.context_window / 1000).toFixed(0)}k ctx`
                : "Custom model"}
              {selectedModelDef.capabilities.supports_vision && " | Vision"}
              {selectedModelDef.capabilities.supports_tools && " | Tools"}
            </p>
          )}
        </div>

        {/* Directory */}
        <div className="space-y-1.5">
          <Label>Working Directory</Label>
          {!showNewDir ? (
            <div className="flex gap-2">
              <Select value={selectedDir} onValueChange={setSelectedDir}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select directory..." />
                </SelectTrigger>
                <SelectContent>
                  {directories.map((dir) => (
                    <SelectItem key={dir} value={dir}>
                      <span className="flex items-center gap-1.5">
                        <FolderOpen className="h-3.5 w-3.5" />
                        {dir}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => setShowNewDir(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="/path/to/project"
                value={newDirPath}
                onChange={(e) => setNewDirPath(e.target.value)}
                className="flex-1"
              />
              <Button variant="default" size="sm" onClick={handleAddDir}>
                Add
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowNewDir(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>

        {/* Permission Preset */}
        <div className="space-y-1.5">
          <Label>Permission Preset</Label>
          <Select value={permPreset} onValueChange={setPermPreset}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">Full Access (read/write, browser, network)</SelectItem>
              <SelectItem value="readonly">Read Only (no writes, restricted sandbox)</SelectItem>
              <SelectItem value="sandboxed">Sandboxed (no filesystem, no network)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!selectedModel || !selectedDir || loading}
            onClick={handleCreate}
          >
            {loading ? "Creating..." : "Create Agent"}
          </Button>
        </div>
      </div>
    </div>
  );
}
