"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getUsage,
  refreshRateLimit,
  type UsageData,
} from "@/lib/api";
import {
  Activity,
  Clock,
  Zap,
  BarChart3,
  RefreshCw,
  Loader2,
  CircleDot,
  AlertTriangle,
  DollarSign,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "now";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainHours = hours % 24;
    return `${days}d ${remainHours}h`;
  }
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Progress bar for a usage/reset window.
 *  Priority: utilization (from Claude) > tokenBudget > time elapsed. */
function ResetBar({
  label,
  icon: Icon,
  msUntilReset,
  windowMs,
  msElapsed,
  resetTime,
  tokens,
  tokenBudget,
  utilization,
  messages,
  cost,
  color,
}: {
  label: string;
  icon: typeof Activity;
  msUntilReset: number;
  windowMs: number;
  msElapsed?: number;
  resetTime?: string;
  tokens: number;
  tokenBudget?: number | null;
  utilization?: number | null;
  messages: number;
  cost: number;
  color: string;
}) {
  let progress: number;
  let progressLabel: string;

  if (utilization != null) {
    // Direct utilization % from Claude's rate_limit_event (most accurate)
    progress = Math.min(1, utilization);
    progressLabel = `${(progress * 100).toFixed(0)}% used`;
  } else if (tokenBudget && tokenBudget > 0) {
    progress = Math.min(1, tokens / tokenBudget);
    progressLabel = `${(progress * 100).toFixed(1)}% used`;
  } else {
    const elapsed = msElapsed != null ? msElapsed : Math.max(0, windowMs - msUntilReset);
    progress = Math.min(1, elapsed / windowMs);
    progressLabel = `${(progress * 100).toFixed(1)}% elapsed`;
  }

  const barColor = progress > 0.9 ? "bg-red-500" : progress > 0.7 ? "bg-amber-500" : color;
  const pct = (progress * 100).toFixed(1);

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Icon className={`h-4 w-4 ${color.replace("bg-", "text-")}`} />
          {label}
        </h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {resetTime && (
            <span>
              Resets{" "}
              {new Date(resetTime).toLocaleDateString(undefined, { weekday: "short" })}{" "}
              {new Date(resetTime).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          <span className="font-mono font-bold text-foreground text-sm">
            {formatDuration(msUntilReset)} left
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative">
        <div className="h-6 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-700 rounded-full`}
            style={{ width: `${Math.max(0.5, Number(pct))}%` }}
          />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-mono font-bold drop-shadow-sm mix-blend-difference text-white">
            {progressLabel}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground">
        <span>
          <span className="font-mono font-medium text-foreground">{formatTokens(tokens)}</span>
          {tokenBudget ? ` / ${formatTokens(tokenBudget)}` : ""} tokens
        </span>
        <span>
          <span className="font-mono font-medium text-foreground">{messages}</span> messages
        </span>
        <span>
          <span className="font-mono font-medium text-foreground">{formatCost(cost)}</span> est. cost
        </span>
      </div>
    </div>
  );
}

/** Stacked bar showing token type breakdown */
function TokenBreakdownBar({ usage }: {
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    total_tokens: number;
  };
}) {
  const total = usage.total_tokens || 1;
  const segments = [
    { label: "Input", value: usage.input_tokens, color: "bg-blue-500" },
    { label: "Output", value: usage.output_tokens, color: "bg-emerald-500" },
    { label: "Cache Write", value: usage.cache_creation_input_tokens, color: "bg-purple-500" },
    { label: "Cache Read", value: usage.cache_read_input_tokens, color: "bg-amber-400" },
  ];

  return (
    <div className="space-y-2">
      <div className="h-4 w-full rounded-full bg-muted overflow-hidden flex">
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100;
          if (pct < 0.1) return null;
          return (
            <div
              key={seg.label}
              className={`h-full ${seg.color} transition-all duration-500`}
              style={{ width: `${pct}%` }}
              title={`${seg.label}: ${formatTokens(seg.value)} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <div className={`h-2 w-2 rounded-full ${seg.color}`} />
            <span>{seg.label}:</span>
            <span className="font-mono font-medium text-foreground">{formatTokens(seg.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  color,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sublabel?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-1">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`h-4 w-4 ${color || ""}`} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
    </div>
  );
}

function RateLimitCard({ usage, onRefresh }: { usage: UsageData; onRefresh: () => void }) {
  const rl = usage.rateLimit;
  const isLimited = rl?.status === "limited";
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshRateLimit();
      onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className={`rounded-lg border p-5 space-y-4 ${isLimited ? "border-amber-500/50 bg-amber-500/5" : "bg-card"}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Shield className={`h-4 w-4 ${isLimited ? "text-amber-500" : "text-emerald-500"}`} />
          Rate Limit Status
          {rl && (
            <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${
              isLimited
                ? "bg-amber-500/10 text-amber-500"
                : "bg-emerald-500/10 text-emerald-500"
            }`}>
              {isLimited ? "Rate Limited" : "Active"}
            </span>
          )}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh rate limit from Claude"
          className="h-7 w-7"
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {rl ? (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Window Type</p>
            <p className="text-sm font-medium">{rl.rateLimitType.replace(/_/g, " ")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Resets At</p>
            <p className="text-sm font-medium">
              {new Date(rl.resetsAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Time Until Reset</p>
            <p className="text-sm font-medium font-mono">{formatDuration(rl.msUntilReset)}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Rate limit data not yet fetched. Click refresh to probe Claude.</span>
        </div>
      )}

      {rl && (
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span>Account: {usage.account.subscriptionType}</span>
          <span>Tier: {usage.account.rateLimitTier}</span>
          {rl.overageStatus !== "rejected" && (
            <span className="text-amber-500">Overage: {rl.overageStatus}</span>
          )}
          <span className="ml-auto">Updated {new Date(rl.fetchedAt).toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}

function DailyChart({ daily }: { daily: UsageData["daily"] }) {
  if (daily.length === 0) return null;
  const maxTokens = Math.max(...daily.map((d) => d.total_tokens), 1);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        Daily Usage (Last 14 Days)
      </h3>
      <div className="flex items-end gap-1 h-32">
        {daily.map((d) => {
          const heightPct = (d.total_tokens / maxTokens) * 100;
          const isToday = d.date === new Date().toISOString().slice(0, 10);
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col items-center gap-1 group relative"
            >
              <div className="w-full relative" style={{ height: "100px" }}>
                <div
                  className={`absolute bottom-0 w-full rounded-t transition-all ${
                    isToday ? "bg-primary" : "bg-primary/40"
                  } group-hover:bg-primary/70`}
                  style={{ height: `${heightPct}%`, minHeight: d.total_tokens > 0 ? "2px" : "0" }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground tabular-nums">
                {d.date.slice(5)}
              </span>
              {/* Tooltip */}
              <div className="absolute -top-20 left-1/2 -translate-x-1/2 bg-popover border rounded px-2 py-1.5 text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-md">
                <p className="font-medium">{d.date}</p>
                <p>{formatTokens(d.total_tokens)} total tokens</p>
                <p className="text-muted-foreground">
                  In: {formatTokens(d.input_tokens)} | Out: {formatTokens(d.output_tokens)}
                </p>
                <p className="text-muted-foreground">
                  Cache W: {formatTokens(d.cache_creation_input_tokens)} | R: {formatTokens(d.cache_read_input_tokens)}
                </p>
                <p>{d.message_count} msgs | {formatCost(d.cost_usd)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const data = await getUsage();
      setUsage(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    const interval = setInterval(fetchUsage, 30000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !usage) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-muted-foreground">{error || "No usage data available"}</p>
        <Button variant="outline" size="sm" onClick={fetchUsage}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  const sessionWindowMs = usage.session.windowHours * 3600_000;
  const sessionMsUntilReset = usage.rateLimit
    ? usage.rateLimit.msUntilReset
    : usage.session.msUntilReset;
  const sessionResetTime = usage.rateLimit?.resetsAt ?? usage.session.resetAt;
  // utilization from Claude's rate_limit_event (actual % used); fall back to time-based
  const sessionUtilization = usage.rateLimit?.utilization ?? null;

  // Weekly: use server-detected reset bounds
  const weeklyWindowMs = 7 * 24 * 3600_000;
  const weeklyResetMs = new Date(usage.weekly.periodEnd).getTime();
  const weeklyMsUntilReset = Math.max(0, weeklyResetMs - Date.now());
  const weeklyMsElapsed = usage.weekly.msElapsed;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Claude Usage</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live rate limits from Claude + token usage from local sessions
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchUsage} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Rate limit from Claude */}
      <RateLimitCard usage={usage} onRefresh={fetchUsage} />

      {/* Session Reset Bar */}
      <ResetBar
        label={`Session Window (${usage.session.windowHours}h)`}
        icon={Clock}
        msUntilReset={sessionMsUntilReset}
        windowMs={sessionWindowMs}
        resetTime={sessionResetTime}
        tokens={usage.session.total_tokens}
        utilization={sessionUtilization}
        messages={usage.session.message_count}
        cost={usage.session.cost_usd}
        color="bg-blue-500"
      />

      {/* Weekly Reset Bar */}
      <ResetBar
        label="Weekly Window (7 days)"
        icon={Zap}
        msUntilReset={weeklyMsUntilReset}
        windowMs={weeklyWindowMs}
        msElapsed={weeklyMsElapsed}
        resetTime={usage.weekly.periodEnd}
        tokens={usage.weekly.total_tokens}
        tokenBudget={usage.weekly.weeklyTokenBudget}
        messages={usage.weekly.message_count}
        cost={usage.weekly.cost_usd}
        color="bg-amber-500"
      />

      {/* Session token breakdown */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-blue-500" />
          Session Token Breakdown
        </h3>
        <TokenBreakdownBar usage={usage.session} />
      </div>

      {/* Weekly token breakdown */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          Weekly Token Breakdown
        </h3>
        <TokenBreakdownBar usage={usage.weekly} />
      </div>

      {/* Daily chart */}
      <div className="rounded-lg border bg-card p-5">
        <DailyChart daily={usage.daily} />
      </div>

      {/* Active sessions */}
      {usage.activeSessions.length > 0 && (
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold">Active Sessions</h3>
          <div className="space-y-2">
            {usage.activeSessions.map((s) => (
              <div key={s.sessionId} className="flex items-center justify-between text-xs border rounded px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono truncate text-muted-foreground">{s.project || s.sessionId}</p>
                </div>
                <span className="text-muted-foreground ml-2">
                  {s.startedAt ? new Date(s.startedAt).toLocaleTimeString() : "\u2014"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="text-[10px] text-muted-foreground text-center">
        Tracking {usage.totalFiles} conversation files across {usage.totalProjects} projects from ~/.claude/
      </p>
    </div>
  );
}
