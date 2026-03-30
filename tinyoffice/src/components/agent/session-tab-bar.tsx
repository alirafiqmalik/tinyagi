"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getAgents,
  getSessions,
  deleteSession,
  type AgentConfig,
  type SessionConfig,
} from "@/lib/api";
import { usePolling } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Plus, X, Pin, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { NewSessionDialog } from "./new-session-dialog";

interface AgentTab {
  id: string;
  name: string;
  model: string;
  isDefault: boolean;
  isSession: boolean;
}

export function SessionTabBar({ activeId }: { activeId?: string }) {
  const router = useRouter();
  const [showNewDialog, setShowNewDialog] = useState(false);

  const fetchTabs = useCallback(async (): Promise<AgentTab[]> => {
    const [agents, sessions] = await Promise.all([getAgents(), getSessions()]);

    const tabs: AgentTab[] = [];

    // Persistent agents
    for (const [id, agent] of Object.entries(agents)) {
      tabs.push({
        id,
        name: agent.name,
        model: agent.model,
        isDefault: id === "default",
        isSession: false,
      });
    }

    // Session agents
    for (const session of sessions) {
      tabs.push({
        id: session.id,
        name: session.name,
        model: session.model,
        isDefault: false,
        isSession: true,
      });
    }

    // Ensure default is first
    tabs.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      if (a.isSession !== b.isSession) return a.isSession ? 1 : -1;
      return 0;
    });

    return tabs;
  }, []);

  const { data: tabs } = usePolling<AgentTab[]>(fetchTabs, 5000);

  const handleDeleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Destroy this session?")) return;
    try {
      await deleteSession(sessionId);
      if (activeId === sessionId) {
        router.push("/agents/default");
      }
    } catch {}
  }, [activeId, router]);

  const handleCreated = useCallback((sessionId: string) => {
    router.push(`/agents/${sessionId}`);
  }, [router]);

  return (
    <>
      <div className="flex items-center gap-1 border-b px-4 py-1.5 overflow-x-auto">
        <TooltipProvider>
          {(tabs || []).map((tab) => (
            <Tooltip key={tab.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => router.push(`/agents/${tab.id}`)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap",
                    activeId === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground"
                  )}
                >
                  {tab.isDefault && <Pin className="h-3 w-3" />}
                  {tab.model === "claude-code" && <Terminal className="h-3 w-3" />}
                  <span>{tab.name}</span>
                  {tab.isSession && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1">
                      session
                    </Badge>
                  )}
                  {tab.isSession && (
                    <button
                      onClick={(e) => handleDeleteSession(tab.id, e)}
                      className="ml-1 opacity-60 hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{tab.model}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => setShowNewDialog(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <NewSessionDialog
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
