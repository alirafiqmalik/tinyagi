"use client";

import { useEffect, useState } from "react";
import { getModels, type ModelDefinition } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Cpu, Eye, Wrench, MessageSquare, Zap, Terminal, Globe,
  Server, HardDrive, Download, CheckCircle2, XCircle, Cloud,
} from "lucide-react";

/** Format custom vendor names: "custom:local-llm-native" → "Custom Provider (localhost:8000)" */
function formatVendorName(vendor: string, models: ModelDefinition[]): string {
  if (!vendor.startsWith("custom:")) return vendor;
  // Try to extract hostname from model metadata or fall back to provider ID
  const providerId = vendor.slice("custom:".length);
  return `Custom Provider (${providerId})`;
}

/** Derive a hostname hint from the vendor for display */
function getCustomProviderHost(vendor: string): string | null {
  if (!vendor.startsWith("custom:")) return null;
  return vendor.slice("custom:".length);
}

const TIER_COLORS: Record<string, string> = {
  fast: "bg-green-500/10 text-green-600 dark:text-green-400",
  code: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  general: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  reasoning: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  embed: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  cloud: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
};

const CATEGORY_LABELS: Record<string, { label: string; icon: typeof Cpu }> = {
  local_installed: { label: "Installed", icon: CheckCircle2 },
  local_recommended: { label: "Available to Install", icon: Download },
  cloud: { label: "Cloud", icon: Cloud },
};

export default function ModelsPage() {
  const [byVendor, setByVendor] = useState<Record<string, ModelDefinition[]>>({});
  const [vendors, setVendors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getModels()
      .then((data) => {
        setByVendor(data.byVendor);
        setVendors(data.vendors);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const harnessColors: Record<string, string> = {
    claude: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    "claude-code": "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    codex: "bg-green-500/10 text-green-600 dark:text-green-400",
    "native-openai": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    opencode: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  };

  const vendorIcons: Record<string, typeof Cpu> = {
    anthropic: Zap,
    openai: Globe,
    opencode: Terminal,
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Cpu className="h-5 w-5 text-primary" />
          Models
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Available models across all providers
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-3 w-3 animate-spin border-2 border-primary border-t-transparent rounded-full" />
          Loading models...
        </div>
      ) : vendors.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Cpu className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">No models found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Check your server configuration
            </p>
          </CardContent>
        </Card>
      ) : (
        vendors.map((vendor) => {
          const models = byVendor[vendor] || [];
          const isCustom = vendor.startsWith("custom:");
          const VendorIcon = isCustom ? Server : (vendorIcons[vendor] || Cpu);
          const vendorLabel = isCustom
            ? formatVendorName(vendor, models)
            : vendor;

          // Group custom provider models by category
          const hasCategories = isCustom && models.some((m) => m.category);

          return (
            <div key={vendor} className="space-y-4">
              <h2 className="text-lg font-semibold capitalize flex items-center gap-2">
                <VendorIcon className="h-4 w-4 text-primary" />
                {vendorLabel}
                <Badge variant="secondary" className="text-[10px]">
                  {models.length} model{models.length !== 1 ? "s" : ""}
                </Badge>
              </h2>

              {hasCategories ? (
                // Render by category for custom providers
                <>
                  {(["local_installed", "local_recommended", "cloud"] as const).map((cat) => {
                    const catModels = models.filter((m) => m.category === cat);
                    if (catModels.length === 0) return null;
                    const catMeta = CATEGORY_LABELS[cat];
                    const CatIcon = catMeta.icon;
                    return (
                      <div key={cat} className="space-y-3">
                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 ml-1">
                          <CatIcon className="h-3.5 w-3.5" />
                          {catMeta.label}
                          <span className="text-[10px]">({catModels.length})</span>
                        </h3>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {catModels.map((model) => (
                            <CustomModelCard key={model.id} model={model} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {/* Models without category */}
                  {models.filter((m) => !m.category).length > 0 && (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {models.filter((m) => !m.category).map((model) => (
                        <BuiltinModelCard key={model.id} model={model} harnessColors={harnessColors} />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                // Flat grid for built-in vendors
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {models.map((model) => (
                    <BuiltinModelCard key={model.id} model={model} harnessColors={harnessColors} />
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/** Card for custom provider models (local/recommended/cloud) */
function CustomModelCard({ model }: { model: ModelDefinition }) {
  const isInstalled = model.installed === true;
  const isCloud = model.category === "cloud";
  const isRecommended = model.category === "local_recommended";

  return (
    <Card className="transition-colors hover:border-primary/50">
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold font-mono truncate">{model.id}</p>
            {model.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {model.description}
              </p>
            )}
          </div>
          <div className="shrink-0">
            {isCloud ? (
              model.available ? (
                <Badge variant="outline" className="text-[10px] gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" /> Available
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                  <XCircle className="h-3 w-3" /> Unavailable
                </Badge>
              )
            ) : isInstalled ? (
              <Badge variant="outline" className="text-[10px] gap-1 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" /> Installed
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                <Download className="h-3 w-3" /> Not installed
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {model.tier && (
            <Badge className={TIER_COLORS[model.tier] || TIER_COLORS.general}>
              {model.tier}
            </Badge>
          )}
          {model.vram_gb != null && model.vram_gb > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <HardDrive className="h-3 w-3" />
              {model.vram_gb} GB VRAM
            </span>
          )}
        </div>

        {isRecommended && model.pull_cmd && (
          <div className="pt-1.5 border-t">
            <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
              {model.pull_cmd}
            </code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Card for built-in vendor models (anthropic, openai, opencode) */
function BuiltinModelCard({
  model,
  harnessColors,
}: {
  model: ModelDefinition;
  harnessColors: Record<string, string>;
}) {
  const caps = model.capabilities;

  return (
    <Card className="transition-colors hover:border-primary/50">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              {model.display_name}
              {model.is_code_agent && (
                <Badge variant="outline" className="text-[10px]">
                  <Terminal className="h-3 w-3 mr-1" />
                  Code
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="font-mono text-xs">{model.id}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={harnessColors[model.harness] || "bg-secondary text-secondary-foreground"}>
            {model.harness}
          </Badge>
          {model.aliases.map((alias) => (
            <Badge key={alias} variant="outline" className="text-[10px] font-mono">
              {alias}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {caps.context_window > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {(caps.context_window / 1000).toFixed(0)}k ctx
            </span>
          )}
          {caps.max_output_tokens && caps.max_output_tokens > 0 && (
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {(caps.max_output_tokens / 1000).toFixed(0)}k out
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1 border-t">
          {caps.supports_vision && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Eye className="h-3 w-3" /> Vision
            </Badge>
          )}
          {caps.supports_tools && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Wrench className="h-3 w-3" /> Tools
            </Badge>
          )}
          {caps.supports_streaming && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <MessageSquare className="h-3 w-3" /> Streaming
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
