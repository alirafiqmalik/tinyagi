"use client";

import { useState, useCallback, useEffect } from "react";
import { usePolling } from "@/lib/hooks";
import {
  getAgents, getSessions, deleteAgent, deleteSession, patchAgent, getModels,
  type AgentConfig, type SessionConfig, type ModelDefinition,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot, Cpu, FileText, Plus, Trash2,
  Loader2, Swords, Pin, Terminal,
} from "lucide-react";
import { NewSessionDialog } from "@/components/agent/new-session-dialog";
import Link from "next/link";

export default function AgentsPage() {
  const { data: agents, loading, refresh } = usePolling<Record<string, AgentConfig>>(getAgents, 0);
  const { data: sessions, refresh: refreshSessions } = usePolling<SessionConfig[]>(getSessions, 5000);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [modelsByVendor, setModelsByVendor] = useState<Record<string, ModelDefinition[]>>({});

  useEffect(() => {
    getModels().then((data) => setModelsByVendor(data.byVendor)).catch(() => {});
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      await deleteAgent(id);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(null);
    }
  }, [refresh]);

  const handleModelChange = useCallback(async (id: string, modelId: string) => {
    const allModels = Object.values(modelsByVendor).flat();
    const model = allModels.find((m) => m.id === modelId);
    if (!model) return;
    const provider = model.vendor;
    try {
      await patchAgent(id, { model: modelId, provider });
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [modelsByVendor, refresh]);

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Agents
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your AI agents
          </p>
        </div>
        <Button onClick={() => setShowNewAgent(true)}>
          <Plus className="h-4 w-4" />
          New Agent
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Agent Grid */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-3 w-3 animate-spin border-2 border-primary border-t-transparent" />
          Loading agents...
        </div>
      ) : agents && Object.keys(agents).length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(agents).map(([id, agent]) => (
            <AgentCard
              key={id}
              id={id}
              agent={agent}
              onDelete={() => handleDelete(id)}
              deleting={deleting === id}
              modelsByVendor={modelsByVendor}
              onModelChange={(modelId) => handleModelChange(id, modelId)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Bot className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">No agents configured</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click &quot;New Agent&quot; to create your first agent
            </p>
          </CardContent>
        </Card>
      )}

      {/* Active Agents (sessions) */}
      {sessions && sessions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            Active Agents
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((session) => (
              <Card key={session.id} className="transition-colors hover:border-primary/50">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{session.name}</CardTitle>
                      <CardDescription className="font-mono text-xs">{session.id}</CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        if (!confirm("Destroy this agent?")) return;
                        await deleteSession(session.id);
                        refreshSessions();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline">{session.model}</Badge>
                    <Badge variant="secondary" className="text-[10px]">session</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{session.working_directory}</p>
                  <div className="pt-2 mt-2 border-t">
                    <Link href={`/agents/${session.id}`}>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
                        <Bot className="h-3 w-3" />
                        Open Chat
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <NewSessionDialog
        open={showNewAgent}
        onClose={() => setShowNewAgent(false)}
        onCreated={() => { refreshSessions(); setShowNewAgent(false); }}
      />
    </div>
  );
}

function AgentCard({
  id, agent, onDelete, deleting, modelsByVendor, onModelChange,
}: {
  id: string;
  agent: AgentConfig;
  onDelete: () => void;
  deleting: boolean;
  modelsByVendor: Record<string, ModelDefinition[]>;
  onModelChange: (modelId: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const providerColors: Record<string, string> = {
    anthropic: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    openai: "bg-green-500/10 text-green-600 dark:text-green-400",
    opencode: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  };

  return (
    <Card className="transition-colors hover:border-primary/50">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-primary/10 text-primary text-sm font-bold uppercase">
              {agent.name.slice(0, 2)}
            </div>
            <div>
              <CardTitle className="text-base">{agent.name}</CardTitle>
              <CardDescription>@{id}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {id === "default" ? (
              <Badge variant="outline" className="text-[10px]">
                <Pin className="h-3 w-3 mr-1" />
                Default
              </Badge>
            ) : confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { onDelete(); setConfirmDelete(false); }}
                  disabled={deleting}
                  className="h-8 text-xs"
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} className="h-8 text-xs">
                  No
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Model selector */}
        <div className="flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Select value={agent.model} onValueChange={onModelChange}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(modelsByVendor).map(([vendor, vendorModels]) => {
                const vendorLabel = vendor.startsWith("custom:")
                  ? `Custom (${vendor.slice("custom:".length)})`
                  : vendor;
                return (
                  <SelectGroup key={vendor}>
                    <SelectLabel className="capitalize text-[10px]">{vendorLabel}</SelectLabel>
                    {vendorModels.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        {m.display_name}
                        {m.installed === true && " (installed)"}
                        {m.installed === false && " (not installed)"}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {agent.system_prompt && (
          <div className="flex items-start gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
            <p className="text-xs text-muted-foreground line-clamp-2">
              {agent.system_prompt}
            </p>
          </div>
        )}

        <div className="pt-2 border-t flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Send messages with <code className="bg-muted px-1 py-0.5 font-mono">@{id}</code> prefix
          </p>
          <Link href={`/agents/${id}`}>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-primary">
              <Swords className="h-3 w-3" />
              Skills
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
