"use client";

import { BankSkill } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { X } from "lucide-react";

interface Props {
  available: BankSkill[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function SkillsBankPicker({ available, selected, onChange }: Props) {
  const [query, setQuery] = useState("");

  const filtered = available.filter(
    s => !selected.includes(s.id) &&
      (s.id.toLowerCase().includes(query.toLowerCase()) || s.name.toLowerCase().includes(query.toLowerCase()))
  );

  function add(id: string) {
    onChange([...selected, id]);
  }

  function remove(id: string) {
    onChange(selected.filter(s => s !== id));
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map(id => {
            const skill = available.find(s => s.id === id);
            return (
              <Badge key={id} variant="secondary" className="text-xs flex items-center gap-1">
                {skill?.name ?? id}
                <button onClick={() => remove(id)} className="ml-0.5 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
      <Input
        className="h-7 text-xs"
        placeholder="Search skills..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {query && filtered.length > 0 && (
        <div className="border rounded p-1 space-y-0.5 max-h-40 overflow-y-auto">
          {filtered.map(s => (
            <button
              key={s.id}
              className="w-full text-left px-2 py-1 text-xs rounded hover:bg-muted flex flex-col"
              onClick={() => { add(s.id); setQuery(""); }}
            >
              <span className="font-medium">{s.name}</span>
              {s.description && <span className="text-muted-foreground truncate">{s.description}</span>}
            </button>
          ))}
        </div>
      )}
      {query && filtered.length === 0 && (
        <p className="text-xs text-muted-foreground px-1">No matching skills.</p>
      )}
    </div>
  );
}
