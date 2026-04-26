"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CheckSquare,
  Clock,
  Cog,
  Download,
  Eye,
  FileText,
  Filter,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Server,
  Shield,
  Square,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { eventsApi } from "@/lib/api";
import type { FactoryEvent, EventStats } from "@/types";

// ── 嚴重度設定 ────────────────────────────────────────────────────────
const SEVERITY_META: Record<string, {
  label:  string;
  pill:   string;
  border: string;
  dot:    string;
  text:   string;
}> = {
  critical: {
    label:  "緊急",
    pill:   "bg-rose-500/10 text-rose-300 border-rose-500/30",
    border: "border-l-rose-500",
    dot:    "bg-rose-500",
    text:   "text-rose-300",
  },
  high: {
    label:  "高",
    pill:   "bg-amber-500/10 text-amber-300 border-amber-500/30",
    border: "border-l-amber-500",
    dot:    "bg-amber-500",
    text:   "text-amber-300",
  },
  medium: {
    label:  "中",
    pill:   "bg-yellow-500/10 text-yellow-300 border-yellow-500/30",
    border: "border-l-yellow-500",
    dot:    "bg-yellow-500",
    text:   "text-yellow-300",
  },
  low: {
    label:  "低",
    pill:   "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    border: "border-l-emerald-500",
    dot:    "bg-emerald-500",
    text:   "text-emerald-300",
  },
  info: {
    label:  "資訊",
    pill:   "bg-sky-500/10 text-sky-300 border-sky-500/30",
    border: "border-l-sky-500",
    dot:    "bg-sky-400",
    text:   "text-sky-300",
  },
};

// ── 事件類型設定 ──────────────────────────────────────────────────────
const TYPE_META: Record<string, {
  label: string;
  icon:  React.ElementType;
  color: string;
}> = {
  detection:     { label: "偵測",     icon: Eye,           color: "text-cyan-400" },
  hazard:        { label: "危害",     icon: AlertTriangle, color: "text-amber-400" },
  ppe_violation: { label: "PPE違規",  icon: Shield,        color: "text-rose-400" },
  equipment:     { label: "設備",     icon: Cog,           color: "text-blue-400" },
  system:        { label: "系統",     icon: Server,        color: "text-slate-400" },
};

function getTypeMeta(type: string) {
  return TYPE_META[type] ?? { label: type, icon: Info, color: "text-slate-400" };
}

function getSeverityMeta(severity: string) {
  return SEVERITY_META[severity] ?? SEVERITY_META["info"];
}

// ── 相對時間 ──────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s 前`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m 前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h 前`;
  return `${Math.floor(diff / 86400)}d 前`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-TW", {
    month:  "2-digit", day:    "2-digit",
    hour:   "2-digit", minute: "2-digit",
    hour12: false,
  });
}

// ── 統計小格 ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-2 font-display text-sm font-semibold ${accent ?? "text-white"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// ── 篩選按鈕 ──────────────────────────────────────────────────────────
function FilterPill({
  active, onClick, children, color,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode; color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[10px] border px-3 py-1.5 text-xs font-semibold transition-all ${
        active
          ? (color ?? "border-brand-500/50 bg-brand-500/15 text-brand-200")
          : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

// ── 事件卡片 ──────────────────────────────────────────────────────────
function EventCard({
  event,
  onAcknowledge,
  onResolve,
  onDelete,
  selectionMode,
  isSelected,
  onToggleSelect,
}: {
  event:          FactoryEvent;
  onAcknowledge:  (id: string) => void;
  onResolve:      (id: string) => void;
  onDelete:       (id: string) => void;
  selectionMode:  boolean;
  isSelected:     boolean;
  onToggleSelect: (id: string) => void;
}) {
  const sm = getSeverityMeta(event.severity);
  const tm = getTypeMeta(event.event_type);
  const TypeIcon = tm.icon;
  const [showThumb, setShowThumb] = useState(false);

  return (
    <div
      onClick={selectionMode ? () => onToggleSelect(event.id) : undefined}
      className={`border-l-2 ${sm.border} rounded-r-[14px] border border-l-[2px] mb-2 overflow-hidden transition-colors ${
        selectionMode
          ? `cursor-pointer ${isSelected
              ? "border-sky-500/40 bg-sky-500/[0.07]"
              : "border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.04]"}`
          : `border-white/[0.06] ${event.resolved ? "opacity-60" : "hover:bg-white/[0.03]"} bg-white/[0.025]`
      }`}
    >
      <div className="flex items-start gap-3 px-4 py-3">

        {/* Left column: checkbox in selection mode, dot+icon otherwise */}
        <div className="flex flex-col items-center gap-1.5 pt-0.5 flex-shrink-0">
          {selectionMode ? (
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
              isSelected
                ? "border-sky-500/50 bg-sky-500/20 text-sky-300"
                : "border-white/15 bg-white/[0.04] text-slate-500"
            }`}>
              {isSelected
                ? <CheckSquare className="h-3.5 w-3.5" />
                : <Square className="h-3.5 w-3.5" />}
            </div>
          ) : (
            <>
              <div className={`h-2.5 w-2.5 rounded-full ${sm.dot} ${event.resolved ? "opacity-40" : "animate-pulse"}`} />
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${sm.pill}`}>
                <TypeIcon className="h-3.5 w-3.5" />
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {/* Severity badge */}
            <span className={`inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sm.pill}`}>
              {sm.label}
            </span>
            {/* Type badge */}
            <span className={`text-[11px] font-semibold ${tm.color}`}>{tm.label}</span>
            {/* Source */}
            <span className="text-[10px] text-slate-600 uppercase tracking-wide">{event.source}</span>
            {/* Acknowledged badge */}
            {event.acknowledged && !event.resolved && (
              <span className="inline-flex items-center gap-1 rounded-[6px] border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />已確認
              </span>
            )}
            {/* Resolved badge */}
            {event.resolved && (
              <span className="inline-flex items-center gap-1 rounded-[6px] border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-[10px] text-slate-400">
                <CheckCircle2 className="h-3 w-3" />已解決
              </span>
            )}
          </div>

          <h3 className={`text-sm font-semibold ${event.resolved ? "text-slate-400" : "text-white"} leading-snug`}>
            {event.title}
          </h3>
          <p className="mt-0.5 text-xs text-slate-400 leading-relaxed line-clamp-2">
            {event.message}
          </p>

          {/* Meta row */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(event.created_at)}
              <span className="text-slate-700">（{relativeTime(event.created_at)}）</span>
            </span>
            {event.location && (
              <span>📍 {event.location}</span>
            )}
            {event.session_id && (
              <span className="font-mono text-slate-700 truncate max-w-[120px]">
                session: {event.session_id.slice(0, 8)}…
              </span>
            )}
            {event.thumbnail && !selectionMode && (
              <button
                onClick={e => { e.stopPropagation(); setShowThumb(v => !v); }}
                className="text-sky-500 hover:text-sky-400 underline"
              >
                {showThumb ? "隱藏截圖" : "查看截圖"}
              </button>
            )}
          </div>

          {/* Thumbnail */}
          {showThumb && event.thumbnail && !selectionMode && (
            <div className="mt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={event.thumbnail}
                alt="事件截圖"
                className="max-h-40 rounded-[10px] border border-white/10 object-contain"
              />
            </div>
          )}
        </div>

        {/* Action buttons — hidden in selection mode */}
        {!selectionMode && (
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            {!event.resolved && !event.acknowledged && (
              <button
                onClick={() => onAcknowledge(event.id)}
                title="確認事件"
                className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04] text-slate-400 transition hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300"
              >
                <Bell className="h-3.5 w-3.5" />
              </button>
            )}
            {!event.resolved && (
              <button
                onClick={() => onResolve(event.id)}
                title="標記已解決"
                className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04] text-slate-400 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => onDelete(event.id)}
              title="刪除事件"
              className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04] text-slate-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ── MD 匯出 ───────────────────────────────────────────────────────────
function exportEventsAsMd(events: FactoryEvent[], label = "所有事件") {
  const now = new Date().toLocaleString("zh-TW", { hour12: false });
  const lines: string[] = [
    `# 工廠事件報告`,
    ``,
    `- **匯出時間**：${now}`,
    `- **範圍**：${label}`,
    `- **筆數**：${events.length}`,
    ``,
    `---`,
    ``,
  ];

  events.forEach((ev, idx) => {
    const sm = getSeverityMeta(ev.severity);
    const tm = getTypeMeta(ev.event_type);
    const status = ev.resolved ? "已解決" : ev.acknowledged ? "已確認" : "未處理";

    lines.push(`## ${idx + 1}. ${ev.title}`);
    lines.push(``);
    lines.push(`| 欄位 | 內容 |`);
    lines.push(`|------|------|`);
    lines.push(`| 嚴重度 | ${sm.label} (${ev.severity}) |`);
    lines.push(`| 類型 | ${tm.label} (${ev.event_type}) |`);
    lines.push(`| 來源 | ${ev.source} |`);
    lines.push(`| 狀態 | ${status} |`);
    lines.push(`| 時間 | ${formatTime(ev.created_at)} |`);
    if (ev.location) lines.push(`| 位置 | ${ev.location} |`);
    if (ev.equipment_id) lines.push(`| 設備 ID | ${ev.equipment_id} |`);
    if (ev.session_id) lines.push(`| Session | ${ev.session_id} |`);
    if (ev.resolved_at) lines.push(`| 解決時間 | ${formatTime(ev.resolved_at)} |`);
    lines.push(``);
    lines.push(`**訊息**：${ev.message}`);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  });

  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `factory-events-${date}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 常數 ──────────────────────────────────────────────────────────────
const SEVERITIES = ["ALL", "critical", "high", "medium", "low", "info"];
const EVENT_TYPES = ["ALL", "detection", "hazard", "ppe_violation", "equipment", "system"];
const TIME_RANGES = [
  { label: "1 小時", h: 1 },
  { label: "24 小時", h: 24 },
  { label: "7 天", h: 168 },
  { label: "全部", h: undefined as number | undefined },
];

const SEVERITY_PILL_ACTIVE: Record<string, string> = {
  critical: "border-rose-500/50 bg-rose-500/15 text-rose-200",
  high:     "border-amber-500/50 bg-amber-500/15 text-amber-200",
  medium:   "border-yellow-500/50 bg-yellow-500/15 text-yellow-200",
  low:      "border-emerald-500/50 bg-emerald-500/15 text-emerald-200",
  info:     "border-sky-500/50 bg-sky-500/15 text-sky-200",
};

// ── 主頁面 ────────────────────────────────────────────────────────────
export default function FactoryEventsPage() {
  const [events,        setEvents]        = useState<FactoryEvent[]>([]);
  const [stats,         setStats]         = useState<EventStats | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [autoRefresh,   setAutoRefresh]   = useState(true);

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());

  // Export dropdown
  const [showExport,    setShowExport]    = useState(false);

  // Filters
  const [severity,    setSeverity]    = useState("ALL");
  const [eventType,   setEventType]   = useState("ALL");
  const [resolved,    setResolved]    = useState<boolean | undefined>(false);
  const [sinceH,      setSinceH]      = useState<number | undefined>(24);
  const [search,      setSearch]      = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => setSearch(searchInput), 400);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [searchInput]);

  // Fetch
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [evRes, stRes] = await Promise.all([
        eventsApi.list({
          severity:   severity   !== "ALL" ? severity   : undefined,
          event_type: eventType  !== "ALL" ? eventType  : undefined,
          resolved:   resolved,
          since_h:    sinceH,
          limit:      200,
        }),
        eventsApi.stats(),
      ]);
      // Client-side search filter
      let data: FactoryEvent[] = evRes.data;
      if (search) {
        const q = search.toLowerCase();
        data = data.filter(e =>
          e.title.toLowerCase().includes(q) ||
          e.message.toLowerCase().includes(q) ||
          e.source.toLowerCase().includes(q)
        );
      }
      setEvents(data);
      setStats(stRes.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      toast.error("載入失敗：" + (e?.response?.data?.detail ?? e?.message ?? "未知錯誤"));
    } finally {
      setLoading(false);
    }
  }, [severity, eventType, resolved, sinceH, search]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 15s (pause in selection mode to avoid confusion)
  useEffect(() => {
    if (!autoRefresh || selectionMode) return;
    const id = setInterval(fetchAll, 15_000);
    return () => clearInterval(id);
  }, [autoRefresh, selectionMode, fetchAll]);

  // ── Handlers ───────────────────────────────────────────────────────
  const handleAcknowledge = async (id: string) => {
    try {
      await eventsApi.acknowledge(id);
      toast.success("事件已確認");
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error("確認失敗：" + (e?.response?.data?.detail ?? "未知錯誤"));
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await eventsApi.resolve(id);
      toast.success("事件已標記解決");
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error("解決失敗：" + (e?.response?.data?.detail ?? "未知錯誤"));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要永久刪除這筆事件？此操作無法復原。")) return;
    try {
      await eventsApi.delete(id);
      toast.success("事件已刪除");
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error("刪除失敗：" + (e?.response?.data?.detail ?? "未知錯誤"));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`確定要永久刪除選取的 ${selectedIds.size} 筆事件？此操作無法復原。`)) return;
    try {
      await eventsApi.batchDelete(Array.from(selectedIds));
      toast.success(`已刪除 ${selectedIds.size} 筆事件`);
      setSelectedIds(new Set());
      setSelectionMode(false);
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error("批次刪除失敗：" + (e?.response?.data?.detail ?? "未知錯誤"));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll  = () => setSelectedIds(new Set(events.map(e => e.id)));
  const clearSelect = () => setSelectedIds(new Set());

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleExportSelected = () => {
    if (selectedIds.size === 0) { toast.error("請先勾選要匯出的事件"); return; }
    const selected = events.filter(e => selectedIds.has(e.id));
    exportEventsAsMd(selected, `已選取 ${selected.length} 筆`);
    setShowExport(false);
  };

  const handleExportAll = () => {
    exportEventsAsMd(events, `全部 ${events.length} 筆`);
    setShowExport(false);
  };

  return (
    <div className="space-y-3">

      {/* ── Header ─────────────────────────────────────────────── */}
      <section className="panel-grid overflow-hidden rounded-2xl px-3 py-2 sm:px-4">
        <div className="relative z-10 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-brand-500/30 bg-brand-500/15">
              <AlertTriangle className="h-3.5 w-3.5 text-brand-300" />
            </div>
            <div>
              <div className="section-kicker">Factory Events</div>
              <h1 className="display-title mt-1 text-sm font-semibold">工廠事件</h1>
            </div>
            {stats && (
              <div className="hidden items-center gap-2 xl:flex">
                {stats.unresolved > 0 && (
                  <span className="status-pill status-pill-danger">
                    {stats.unresolved} 未解決
                  </span>
                )}
                {stats.critical_24h > 0 && (
                  <span className="status-pill status-pill-danger">
                    {stats.critical_24h} 緊急（24h）
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 批次選取 */}
            <button
              onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
              className={`secondary-button ${selectionMode ? "border-sky-500/50 bg-sky-500/15 text-sky-200" : ""}`}
            >
              {selectionMode ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {selectionMode ? "退出選取" : "批次選取"}
            </button>

            {/* 匯出 MD */}
            <div className="relative">
              <button
                onClick={() => setShowExport(v => !v)}
                className="secondary-button"
              >
                <FileText className="h-4 w-4" />
                匯出 MD
              </button>
              {showExport && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExport(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-[14px] border border-white/10 bg-slate-900 shadow-xl">
                    <button
                      onClick={handleExportSelected}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06]"
                    >
                      <Download className="h-3.5 w-3.5 text-sky-400" />
                      匯出已選取
                    </button>
                    <div className="border-t border-white/8" />
                    <button
                      onClick={handleExportAll}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06]"
                    >
                      <Download className="h-3.5 w-3.5 text-emerald-400" />
                      匯出全部（{events.length}）
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setAutoRefresh(v => !v)}
              className={`secondary-button ${autoRefresh ? "border-brand-500/50 bg-brand-500/15 text-brand-200" : ""}`}
            >
              <RefreshCw className={`h-4 w-4 ${autoRefresh ? "animate-spin" : ""}`} />
              {autoRefresh ? "自動刷新" : "手動模式"}
            </button>
            <button onClick={fetchAll} disabled={loading} className="secondary-button">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              刷新
            </button>
          </div>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="relative z-10 mt-2 grid grid-cols-2 gap-2 border-t border-white/8 pt-3 sm:grid-cols-4">
            <StatCard
              label="事件總數"
              value={stats.total.toLocaleString()}
              sub="資料庫累計"
            />
            <StatCard
              label="未解決"
              value={stats.unresolved}
              sub="待處理"
              accent={stats.unresolved > 0 ? "text-amber-400" : "text-white"}
            />
            <StatCard
              label="緊急（24h）"
              value={stats.critical_24h}
              sub="critical severity"
              accent={stats.critical_24h > 0 ? "text-rose-400" : "text-white"}
            />
            <StatCard
              label="高風險（24h）"
              value={stats.high_24h}
              sub="high severity"
              accent={stats.high_24h > 0 ? "text-amber-400" : "text-white"}
            />
          </div>
        )}
      </section>

      {/* ── Filter Bar ──────────────────────────────────────────── */}
      <section className="panel-soft rounded-xl px-3 py-3">
        <div className="flex flex-wrap items-center gap-3">

          {/* Search */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="搜尋標題、訊息…"
              className="w-full rounded-[12px] border border-white/10 bg-slate-950/50 py-2 pl-9 pr-3.5 text-sm text-white placeholder-slate-600 outline-none focus:border-brand-500/50"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Severity filter */}
          <div className="flex flex-wrap gap-1.5">
            {SEVERITIES.map(s => (
              <FilterPill
                key={s}
                active={severity === s}
                onClick={() => setSeverity(s)}
                color={s !== "ALL" ? SEVERITY_PILL_ACTIVE[s] : undefined}
              >
                {s === "ALL" ? "全部嚴重度" : getSeverityMeta(s).label}
              </FilterPill>
            ))}
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={eventType}
              onChange={e => setEventType(e.target.value)}
              className="rounded-[12px] border border-white/10 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-300 outline-none focus:border-brand-500/50"
            >
              {EVENT_TYPES.map(t => (
                <option key={t} value={t}>
                  {t === "ALL" ? "全部類型" : (TYPE_META[t]?.label ?? t)}
                </option>
              ))}
            </select>
          </div>

          {/* Resolved toggle */}
          <div className="flex gap-1.5">
            <FilterPill active={resolved === false} onClick={() => setResolved(false)}>
              未解決
            </FilterPill>
            <FilterPill active={resolved === true} onClick={() => setResolved(true)}>
              已解決
            </FilterPill>
            <FilterPill active={resolved === undefined} onClick={() => setResolved(undefined)}>
              全部
            </FilterPill>
          </div>

          {/* Time range */}
          <div className="flex gap-1.5">
            {TIME_RANGES.map(r => (
              <FilterPill
                key={r.label}
                active={sinceH === r.h}
                onClick={() => setSinceH(r.h)}
              >
                {r.label}
              </FilterPill>
            ))}
          </div>

        </div>
      </section>

      {/* ── Type Stats ────────────────────────────────────────── */}
      {stats && Object.keys(stats.by_type).length > 0 && (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(stats.by_type)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => {
              const tm = getTypeMeta(type);
              const TIcon = tm.icon;
              return (
                <button
                  key={type}
                  onClick={() => setEventType(eventType === type ? "ALL" : type)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                    eventType === type
                      ? "border-brand-500/40 bg-brand-500/10"
                      : "border-white/8 bg-white/[0.025] hover:bg-white/[0.05]"
                  }`}
                >
                  <TIcon className={`h-3.5 w-3.5 ${tm.color} mb-1`} />
                  <p className="text-base font-semibold text-white">{count}</p>
                  <p className="text-[10px] text-slate-500">{tm.label}</p>
                </button>
              );
            })}
        </section>
      )}

      {/* ── Event List ───────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-white">
            事件列表
            <span className="ml-2 text-xs font-normal text-slate-500">
              ({events.length} 筆{loading ? "，更新中…" : ""})
            </span>
          </h2>
        </div>

        {/* Batch operations bar */}
        {selectionMode && (
          <div className="mb-2 flex items-center gap-2 rounded-[14px] border border-sky-500/20 bg-sky-500/[0.06] px-4 py-2.5">
            <span className="text-xs text-sky-300 font-semibold min-w-[80px]">
              已選 {selectedIds.size} / {events.length} 筆
            </span>
            <button
              onClick={selectAll}
              className="rounded-[8px] border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300 hover:text-white transition-colors"
            >
              全選
            </button>
            <button
              onClick={clearSelect}
              className="rounded-[8px] border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300 hover:text-white transition-colors"
            >
              取消全選
            </button>
            <div className="flex-1" />
            <button
              onClick={handleExportSelected}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 rounded-[10px] border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="h-3.5 w-3.5" />
              匯出 MD（{selectedIds.size}）
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 rounded-[10px] border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3.5 w-3.5" />
              刪除選取（{selectedIds.size}）
            </button>
          </div>
        )}

        {loading && events.length === 0 ? (
          <div className="panel-soft flex items-center justify-center rounded-2xl py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
          </div>
        ) : events.length === 0 ? (
          <div className="panel-soft flex flex-col items-center rounded-2xl py-16 text-center">
            <Info className="h-10 w-10 text-slate-600" />
            <p className="mt-2 text-base font-semibold text-white">暫無事件記錄</p>
            <p className="mt-2 text-sm text-slate-500">目前沒有符合篩選條件的事件，系統持續自動偵測中</p>
          </div>
        ) : (
          <div>
            {events.map(event => (
              <EventCard
                key={event.id}
                event={event}
                onAcknowledge={handleAcknowledge}
                onResolve={handleResolve}
                onDelete={handleDelete}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(event.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
