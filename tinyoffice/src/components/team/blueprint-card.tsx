"use client";

import { BlueprintAgent } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2 } from "lucide-react";

interface Props {
  blueprint: BlueprintAgent;
  onEdit: () => void;
  onDelete: () => void;
}

export function BlueprintCard({ blueprint, onEdit, onDelete }: Props) {
  return (
    <div className="border rounded-lg p-4 space-y-2 bg-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm">{blueprint.name}</p>
          <p className="text-xs text-muted-foreground">{blueprint.provider} / {blueprint.model}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {(blueprint.skills ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {blueprint.skills!.map(s => (
            <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
          ))}
        </div>
      )}

      {blueprint.copied_from && (
        <p className="text-xs text-muted-foreground">Copied from agent: {blueprint.copied_from}</p>
      )}
    </div>
  );
}
