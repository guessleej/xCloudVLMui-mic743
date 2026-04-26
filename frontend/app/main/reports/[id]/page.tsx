"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  CalendarClock,
  Download,
  Edit3,
  Eye,
  Save,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { reportsApi } from "@/lib/api";
import type { Report, RiskLevel } from "@/types";
import { ReportAccordion } from "@/components/reports/report-accordion";

/* ── 常數 ─────────────────────────────────────────────────────────── */
const RISK_OPTIONS: Array<{ value: RiskLevel; label: string; color: string }> = [
  { value: "critical", label: "🔴 危急", color: "text-red-400" },
  { value: "elevated", label: "🟠 升高", color: "text-orange-400" },
  { value: "moderate", label: "🔵 中等", color: "text-blue-400" },
  { value: "low",      label: "🟢 低",   color: "text-green-400" },
];

const LEVEL_MAP: Record<string, { label: string; badge: string }> = {
  critical: { label: "危急", badge: "badge-critical" },
  elevated: { label: "升高", badge: "badge-elevated" },
  moderate: { label: "中等", badge: "badge-moderate" },
  low:      { label: "低",   badge: "badge-low" },
};

/* ── 主頁 ─────────────────────────────────────────────────────────── */
export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const reportId = params.id;

  const [report, setReport]         = useState<Report | null>(null);
  const [loading, setLoading]       = useState(true);
  const [mode, setMode]             = useState<"view" | "edit">("view");
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);

  /* 編輯欄位 */
  const [editTitle, setEditTitle]           = useState("");
  const [editEquipName, setEditEquipName]   = useState("");
  const [editRisk, setEditRisk]             = useState<RiskLevel>("moderate");
  const [editMarkdown, setEditMarkdown]     = useState("");

  /* ── 讀取報告 ─────────────────────────────────────────────────── */
  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reportsApi.getById(reportId);
      const data = res.data as Report;
      setReport(data);
      resetEditFields(data);
    } catch {
      toast.error("無法讀取報告，請確認報告 ID 是否正確。");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  function resetEditFields(r: Report) {
    setEditTitle(r.title);
    setEditEquipName(r.equipment_name ?? "");
    setEditRisk(r.risk_level);
    setEditMarkdown(r.markdown_content ?? "");
  }

  /* ── 進入編輯模式 ─────────────────────────────────────────────── */
  function enterEdit() {
    if (report) resetEditFields(report);
    setMode("edit");
  }

  function cancelEdit() {
    if (report) resetEditFields(report);
    setMode("view");
  }

  /* ── 儲存 ─────────────────────────────────────────────────────── */
  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title:            editTitle.trim() || report?.title,
        equipment_name:   editEquipName.trim() || null,
        risk_level:       editRisk,
        markdown_content: editMarkdown,
      };
      const res = await reportsApi.update(reportId, payload);
      const updated = res.data as Report;
      setReport(updated);
      setMode("view");
      toast.success("報告已儲存。");
    } catch {
      toast.error("儲存失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  }

  /* ── 刪除 ─────────────────────────────────────────────────────── */
  async function handleDelete() {
    if (!confirm("確定要刪除此報告嗎？此動作無法復原。")) return;
    setDeleting(true);
    try {
      await reportsApi.delete(reportId);
      toast.success("報告已刪除。");
      router.push("/main/reports");
    } catch {
      toast.error("刪除失敗，請稍後再試。");
      setDeleting(false);
    }
  }

  /* ── 下載 ─────────────────────────────────────────────────────── */
  function handleDownload() {
    if (!report) return;
    const blob = new Blob([report.markdown_content ?? ""], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${report.title.replace(/\s+/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("報告已下載為 Markdown。");
  }

  /* ── Loading 狀態 ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-400/40 border-t-accent-400" />
          <span className="text-sm">讀取報告中…</span>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-slate-400">
        <p className="text-lg font-semibold">找不到報告</p>
        <Link href="/main/reports" className="secondary-button px-4 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Link>
      </div>
    );
  }

  const level = LEVEL_MAP[report.risk_level] ?? LEVEL_MAP.moderate;

  /* ── 檢視模式 ─────────────────────────────────────────────────── */
  if (mode === "view") {
    return (
      <div className="space-y-3">
        {/* 頂部導覽 */}
        <section className="panel-grid overflow-hidden rounded-2xl p-3 sm:p-4">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link
                href="/main/reports"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <div className="section-kicker">Report Detail</div>
                <h1 className="mt-0.5 text-sm font-semibold text-white line-clamp-1">
                  {report.title}
                </h1>
              </div>
            </div>

            {/* 操作按鈕 */}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={handleDownload} className="secondary-button px-3 py-2 text-xs">
                <Download className="h-3.5 w-3.5" />
                下載 MD
              </button>
              <button onClick={enterEdit} className="secondary-button px-3 py-2 text-xs">
                <Edit3 className="h-3.5 w-3.5" />
                編輯
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? "刪除中…" : "刪除"}
              </button>
            </div>
          </div>
        </section>

        {/* 主內容：Metadata + Preview */}
        <section className="grid gap-3 xl:grid-cols-[1fr_0.55fr]">
          {/* Markdown 預覽 */}
          <div className="panel-soft overflow-y-auto rounded-xl p-4 sm:p-6" style={{ maxHeight: "calc(100vh - 240px)" }}>
            <div className="mb-4 flex items-center gap-2 border-b border-white/8 pb-3">
              <Eye className="h-4 w-4 text-accent-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">報告預覽</span>
            </div>
            {report.markdown_content ? (
              <ReportAccordion markdown={report.markdown_content} />
            ) : (
              <div className="flex h-40 items-center justify-center text-slate-500 text-sm">
                此報告尚無 Markdown 內容。
              </div>
            )}
          </div>

          {/* 屬性側欄 */}
          <div className="space-y-3">
            <div className="panel-soft rounded-xl p-4">
              <div className="mb-3 border-b border-white/8 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                報告屬性
              </div>
              <dl className="space-y-3 text-sm">
                <MetaRow label="風險等級">
                  <span className={level.badge}>{level.label}</span>
                </MetaRow>
                <MetaRow label="來源">{report.source}</MetaRow>
                {report.equipment_name && (
                  <MetaRow label="設備名稱">{report.equipment_name}</MetaRow>
                )}
                {report.equipment_id && (
                  <MetaRow label="設備 ID">
                    <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-slate-300">
                      {report.equipment_id}
                    </code>
                  </MetaRow>
                )}
                <MetaRow label="建立時間">
                  <span className="flex items-center gap-1 text-slate-400">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {new Date(report.created_at).toLocaleString("zh-TW")}
                  </span>
                </MetaRow>
                {report.updated_at && (
                  <MetaRow label="最後更新">
                    <span className="text-slate-400">
                      {new Date(report.updated_at).toLocaleString("zh-TW")}
                    </span>
                  </MetaRow>
                )}
                <MetaRow label="報告 ID">
                  <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-slate-500">
                    {report.id}
                  </code>
                </MetaRow>
              </dl>
            </div>

            <div className="panel-soft rounded-xl p-4">
              <div className="mb-3 border-b border-white/8 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                快速操作
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={enterEdit} className="secondary-button w-full justify-start px-3 py-2.5 text-sm">
                  <Edit3 className="h-4 w-4" />
                  編輯報告內容
                </button>
                <button onClick={handleDownload} className="secondary-button w-full justify-start px-3 py-2.5 text-sm">
                  <Download className="h-4 w-4" />
                  下載 Markdown 檔案
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex w-full items-center justify-start gap-2 rounded-xl border border-red-500/15 bg-red-500/5 px-3 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-500/15 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? "刪除中…" : "刪除此報告"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  /* ── 編輯模式 ─────────────────────────────────────────────────── */
  return (
    <div className="space-y-3">
      {/* 頂部 */}
      <section className="panel-grid overflow-hidden rounded-2xl p-3 sm:p-4">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={cancelEdit}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <div>
              <div className="section-kicker">Edit Report</div>
              <h1 className="mt-0.5 text-sm font-semibold text-white">編輯報告</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={cancelEdit} className="secondary-button px-3 py-2 text-xs">
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-accent-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "儲存中…" : "儲存"}
            </button>
          </div>
        </div>
      </section>

      {/* 表單 + 即時預覽 */}
      <section className="grid gap-3 xl:grid-cols-2">
        {/* 左側：表單 */}
        <div className="panel-soft space-y-4 rounded-xl p-4 sm:p-6">
          <div className="border-b border-white/8 pb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            報告資訊
          </div>

          {/* 標題 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">報告標題 *</label>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="報告標題…"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-accent-400/40 focus:outline-none focus:ring-2 focus:ring-accent-400/10"
            />
          </div>

          {/* 設備名稱 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">設備名稱</label>
            <input
              value={editEquipName}
              onChange={(e) => setEditEquipName(e.target.value)}
              placeholder="如：壓縮機 A01…"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-accent-400/40 focus:outline-none focus:ring-2 focus:ring-accent-400/10"
            />
          </div>

          {/* 風險等級 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">風險等級</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RISK_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEditRisk(opt.value)}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                    editRisk === opt.value
                      ? "border-accent-400/30 bg-accent-400/15 text-white"
                      : "border-white/8 bg-white/[0.03] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Markdown 編輯器 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">Markdown 內容</label>
            <textarea
              value={editMarkdown}
              onChange={(e) => setEditMarkdown(e.target.value)}
              rows={20}
              placeholder="使用 Markdown 格式撰寫報告內容…"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-mono text-xs leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-accent-400/40 focus:outline-none focus:ring-2 focus:ring-accent-400/10"
            />
          </div>
        </div>

        {/* 右側：即時 Markdown 預覽 */}
        <div className="panel-soft rounded-xl p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2 border-b border-white/8 pb-3">
            <Eye className="h-4 w-4 text-accent-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">即時預覽</span>
          </div>
          {editMarkdown ? (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {editMarkdown}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-slate-600 text-sm">
              輸入 Markdown 後顯示預覽
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ── 輔助元件 ─────────────────────────────────────────────────────── */
function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right text-slate-200">{children}</dd>
    </div>
  );
}
