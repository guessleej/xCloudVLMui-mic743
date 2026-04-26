"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Eye,
  Filter,
  Info,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Save,
  ScanLine,
  Server,
  Settings2,
  Sliders,
  Sparkles,
  Thermometer,
  Trash2,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { settingsApi } from "@/lib/api";
import type { SystemSettings } from "@/types";

/* ── 預設值 ─────────────────────────────────────────────────────── */
const DEFAULT_SYSTEM_PROMPT = `你是一個智慧文件問答助理，能夠根據使用者上傳的任意文件內容回答問題。

回答規則：
1. 若「參考資料」中有明確答案（含數字、日期、百分比、名稱等），請**直接引用原文**並給出精確回答
2. 不要自行推測或引入參考資料以外的資訊
3. 若參考資料確實沒有答案，簡短說明「文件中未找到相關內容」即可，不必過度解釋
4. 回答簡潔，直接回答問題，Markdown 格式輸出`;

const DEFAULT: SystemSettings = {
  ocr_engine:        "vlm",
  embed_model_url:   "",
  embed_model_name:  "bge-m3",
  llm_model_url:     "",
  llm_model_name:    "gemma4:e4b",
  vlm_model_name:    "qwen3-vl:30b",
  chunk_size:        500,
  chunk_overlap:     80,
  rag_top_k:         6,
  llm_temperature:   0.1,
  llm_max_tokens:    1024,
  min_score:         0.3,
  rag_system_prompt: DEFAULT_SYSTEM_PROMPT,
};

/* ═══════════════════════════════════════════════════════════════════
   子元件
═══════════════════════════════════════════════════════════════════ */

function SectionCard({
  icon: Icon, title, subtitle, eyebrow, badge, accent, children,
}: {
  icon: React.ElementType; title: string; subtitle: string;
  eyebrow: string; badge?: React.ReactNode;
  accent?: "brand" | "purple" | "emerald" | "amber" | "sky";
  children: React.ReactNode;
}) {
  const colors: Record<string, string> = {
    brand:   "border-brand-400/20 bg-brand-400/10 text-brand-300",
    purple:  "border-purple-400/20 bg-purple-400/10 text-purple-300",
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    amber:   "border-amber-400/20 bg-amber-400/10 text-amber-300",
    sky:     "border-sky-400/20 bg-sky-400/10 text-sky-300",
  };
  const cls = colors[accent ?? "brand"];
  return (
    <div className="panel-soft rounded-xl p-3 sm:p-4">
      <div className="flex items-start gap-2 border-b border-white/8 pb-3">
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border ${cls}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
            {badge}
          </div>
          <h2 className="mt-1 text-sm font-semibold text-white">{title}</h2>
          <p className="mt-1 text-[11px] leading-4 text-slate-400">{subtitle}</p>
        </div>
      </div>
      <div className="mt-3 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold text-white">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-4 text-slate-500">{hint}</p>}
    </div>
  );
}

function LiveBadge({ value, label }: { value: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
      {label ?? "生效中"}: {value}
    </span>
  );
}

function Slider({
  min, max, step, value, onChange, left, right, format,
}: {
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void;
  left?: string; right?: string;
  format?: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        {left  && <span className="text-[10px] text-slate-500">{left}</span>}
        <span className="mx-auto rounded-lg border border-brand-500/30 bg-brand-500/15 px-2.5 py-0.5 text-xs font-semibold text-brand-300">
          {format ? format(value) : value}
        </span>
        {right && <span className="text-[10px] text-slate-500">{right}</span>}
      </div>
      <div className="relative h-2 w-full cursor-pointer rounded-full bg-white/10">
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-brand-400 bg-slate-900 shadow transition-all"
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-2 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20";

const numInputCls =
  inputCls + " [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

type TestResult = { ok: boolean; latency?: number; error?: string } | null;

/* ═══════════════════════════════════════════════════════════════════
   主頁面
═══════════════════════════════════════════════════════════════════ */
export default function SettingsPage() {
  const [settings,   setSettings]  = useState<SystemSettings>(DEFAULT);
  const [saving,     setSaving]    = useState(false);
  const [loading,    setLoading]   = useState(true);
  const [resetting,  setReset]     = useState(false);
  const [reindexing, setReindexing]= useState(false);
  const [saved,      setSaved]     = useState(false);
  const [dirty,      setDirty]     = useState(false);
  const [promptOpen, setPromptOpen]= useState(false);

  const [embedTest,    setEmbedTest]    = useState<TestResult>(null);
  const [llmTest,      setLlmTest]      = useState<TestResult>(null);
  const [testingEmbed, setTestingEmbed] = useState(false);
  const [testingLlm,   setTestingLlm]   = useState(false);

  /* ── 載入 ── */
  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await settingsApi.get();
      setSettings({ ...DEFAULT, ...res.data });
      setDirty(false);
    } catch { toast.error("載入設定失敗"); }
    finally  { setLoading(false); }
  }, []);
  useEffect(() => { loadSettings(); }, [loadSettings]);

  /* ── 儲存 ── */
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await settingsApi.update(settings as unknown as Record<string, unknown>);
      setSettings({ ...DEFAULT, ...res.data });
      setSaved(true); setDirty(false);
      toast.success("✅ 設定已儲存並即時套用！");
      setTimeout(() => setSaved(false), 3000);
    } catch { toast.error("儲存失敗"); }
    finally  { setSaving(false); }
  };

  /* ── 重置 ── */
  const handleReset = async () => {
    if (!window.confirm("確定要重置所有設定為預設值嗎？")) return;
    setReset(true);
    try {
      const res = await settingsApi.reset();
      setSettings({ ...DEFAULT, ...res.data });
      setDirty(false);
      toast.success("已重置為預設值");
    } catch { toast.error("重置失敗"); }
    finally  { setReset(false); }
  };

  /* ── Re-index ── */
  const handleReindex = async () => {
    if (!window.confirm(
      "此操作將清空 ChromaDB 向量索引並以新模型重建種子文件。\n\n" +
      "⚠️ 您上傳的文件需重新上傳才能繼續使用。確定執行？"
    )) return;
    setReindexing(true);
    try {
      const res = await fetch("/api/settings/reindex", { method: "POST" });
      const d = await res.json();
      if (res.ok) toast.success(d.message ?? "Re-index 完成");
      else toast.error(d.detail ?? "Re-index 失敗");
    } catch { toast.error("Re-index 請求失敗"); }
    finally  { setReindexing(false); }
  };

  /* ── 測試 Embedding ── */
  const testEmbedding = async () => {
    setTestingEmbed(true); setEmbedTest(null);
    const t0 = Date.now();
    try {
      const res = await fetch("/api/chat/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "test embedding ping", top_k: 1 }),
        signal: AbortSignal.timeout(15000),
      });
      const latency = Date.now() - t0;
      setEmbedTest(res.ok ? { ok: true, latency } : { ok: false, error: `HTTP ${res.status}` });
    } catch (e: any) { setEmbedTest({ ok: false, error: e.message ?? "逾時" }); }
    finally { setTestingEmbed(false); }
  };

  /* ── 測試 LLM ── */
  const testLlm = async () => {
    setTestingLlm(true); setLlmTest(null);
    const t0 = Date.now();
    try {
      const res = await fetch("/api/vlm/status", { signal: AbortSignal.timeout(8000) });
      const latency = Date.now() - t0;
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        setLlmTest({ ok: d.llm_ok === true, latency, error: d.llm_ok ? undefined : "LLM 未就緒" });
      } else {
        setLlmTest({ ok: false, error: `HTTP ${res.status}` });
      }
    } catch (e: any) { setLlmTest({ ok: false, error: e.message ?? "逾時" }); }
    finally { setTestingLlm(false); }
  };

  /* ── 更新欄位 ── */
  const set = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const connBadge = (test: TestResult) =>
    test ? (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
        test.ok
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
          : "border-red-500/25 bg-red-500/10 text-red-400"
      }`}>
        {test.ok ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
        {test.ok ? `${test.latency}ms` : test.error}
      </span>
    ) : undefined;

  if (loading) return (
    <div className="flex min-h-[400px] items-center justify-center gap-3">
      <RefreshCw className="h-6 w-6 animate-spin text-brand-400" />
      <span className="text-sm text-slate-400">載入設定中…</span>
    </div>
  );

  /* ── Render ── */
  return (
    <div className="space-y-3">

      {/* 頁首 */}
      <section className="panel-grid overflow-hidden rounded-2xl p-3 sm:p-4">
        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="section-kicker">System Config</div>
              <h2 className="text-sm font-semibold text-white">系統設定</h2>
            </div>
            {dirty && (
              <div className="mt-2 flex items-center gap-2 text-amber-400">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">有未儲存的變更</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleReset} disabled={resetting} className="secondary-button text-xs">
              {resetting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              重置預設
            </button>
            <button onClick={handleSave} disabled={saving} className="primary-button">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saving ? "儲存中…" : saved ? "已儲存 ✓" : "儲存設定"}
            </button>
          </div>
        </div>
      </section>

      {/* 生效說明 */}
      <div className="flex items-start gap-3 rounded-xl border border-sky-500/20 bg-sky-500/8 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-400" />
        <p className="text-[11px] leading-4 text-sky-300">
          設定儲存後<strong> 即時套用</strong>（無需重啟）。
          切換 Embedding 模型後須執行 <strong>Re-index</strong> 重建向量索引，否則舊向量維度不相容。
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">

        {/* ── OCR 引擎 ── */}
        <SectionCard icon={ScanLine} title="OCR 引擎設定"
          subtitle="圖片上傳時使用哪個視覺模型進行文字辨識"
          eyebrow="OCR Engine" accent="purple"
          badge={<LiveBadge value={settings.ocr_engine} />}
        >
          <Field label="OCR 引擎" hint="vlm：使用本地 VLM 視覺模型；disabled：停用圖片 OCR">
            <div className="flex gap-3">
              {(["vlm", "disabled"] as const).map((engine) => (
                <button key={engine} onClick={() => set("ocr_engine", engine)}
                  className={`flex-1 rounded-2xl border py-2 text-sm font-semibold transition-colors ${
                    settings.ocr_engine === engine
                      ? "border-purple-500/50 bg-purple-500/20 text-white"
                      : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {engine === "vlm" ? "VLM（視覺模型）" : "停用"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="VLM 視覺模型名稱" hint="Ollama 中已下載的視覺模型，如 qwen3-vl:30b、llava:7b">
            <input type="text" className={inputCls}
              placeholder="qwen3-vl:30b"
              value={settings.vlm_model_name ?? ""}
              onChange={(e) => set("vlm_model_name", e.target.value)}
            />
          </Field>
        </SectionCard>

        {/* ── Embedding 模型 ── */}
        <SectionCard icon={Zap} title="向量嵌入模型"
          subtitle="文字向量化的模型（RAG 比對核心）"
          eyebrow="Embedding Model" accent="brand"
          badge={connBadge(embedTest)}
        >
          <Field label="嵌入模型名稱" hint="推薦中文：bge-m3；英文：nomic-embed-text；多語言：mxbai-embed-large">
            <input type="text" className={inputCls}
              placeholder="bge-m3"
              value={settings.embed_model_name}
              onChange={(e) => set("embed_model_name", e.target.value)}
            />
          </Field>
          <Field label="嵌入端點 URL（選填）" hint="留空使用預設 Ollama 端點">
            <input type="text" className={inputCls}
              placeholder="留空使用預設"
              value={settings.embed_model_url}
              onChange={(e) => set("embed_model_url", e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button onClick={testEmbedding} disabled={testingEmbed}
              className="secondary-button text-xs"
            >
              {testingEmbed ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
              測試連線
            </button>
            <button onClick={handleReindex} disabled={reindexing}
              className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              {reindexing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {reindexing ? "重建中…" : "Re-index 索引"}
            </button>
          </div>
          <div className="rounded-xl border border-amber-400/15 bg-amber-400/5 px-3 py-2">
            <p className="text-[11px] text-amber-300/80 leading-4">
              ⚠ 切換 Embedding 模型後必須執行 Re-index，否則舊向量維度不相容導致搜尋失準。
              執行後需重新上傳文件。
            </p>
          </div>
        </SectionCard>

        {/* ── 語言模型 ── */}
        <SectionCard icon={Server} title="語言模型設定"
          subtitle="RAG 問答與報告生成使用的 LLM"
          eyebrow="LLM Endpoint" accent="sky"
          badge={connBadge(llmTest)}
        >
          <Field label="語言模型名稱" hint="Ollama 中已下載的 LLM，如 gemma4:e4b、qwen3:14b">
            <input type="text" className={inputCls}
              placeholder="gemma4:e4b"
              value={settings.llm_model_name}
              onChange={(e) => set("llm_model_name", e.target.value)}
            />
          </Field>
          <Field label="語言模型端點 URL（選填）" hint="留空使用預設 Ollama 端點">
            <input type="text" className={inputCls}
              placeholder="留空使用預設"
              value={settings.llm_model_url}
              onChange={(e) => set("llm_model_url", e.target.value)}
            />
          </Field>
          <button onClick={testLlm} disabled={testingLlm} className="secondary-button text-xs">
            {testingLlm ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
            測試 LLM 連線
          </button>
        </SectionCard>

        {/* ── RAG 切片參數 ── */}
        <SectionCard icon={Sliders} title="文件切片設定"
          subtitle="上傳文件時的段落分割方式"
          eyebrow="Chunking" accent="emerald"
        >
          <Field label={`切片大小：${settings.chunk_size} 字元`}
            hint="每個段落的最大字元數。中文文件建議 400–600，英文可用 600–1000。"
          >
            <Slider min={100} max={2000} step={50}
              value={settings.chunk_size}
              onChange={(v) => set("chunk_size", v)}
              left="100" right="2000"
              format={(v) => `${v} chars`}
            />
          </Field>
          <Field label={`切片重疊：${settings.chunk_overlap} 字元`}
            hint="相鄰段落重疊長度，避免語意斷裂。建議為切片大小的 10–20%。"
          >
            <Slider min={0} max={400} step={20}
              value={settings.chunk_overlap}
              onChange={(v) => set("chunk_overlap", v)}
              left="0" right="400"
              format={(v) => `${v} chars`}
            />
          </Field>
          <div className="rounded-xl border border-white/8 bg-slate-950/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-2">切片預覽</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "段落大小", value: settings.chunk_size,   unit: "chars" },
                { label: "重疊長度", value: settings.chunk_overlap, unit: "chars" },
              ].map(({ label, value, unit }) => (
                <div key={label} className="text-center rounded-xl bg-white/[0.03] py-2">
                  <p className="font-display text-lg font-semibold text-white">{value}</p>
                  <p className="text-[10px] text-slate-500">{unit}</p>
                  <p className="text-xs text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

      </div>

      {/* ── RAG 調教區（全寬）── */}
      <SectionCard icon={Sparkles} title="RAG 推論調教"
        subtitle="控制語意搜尋品質、生成溫度與 System Prompt"
        eyebrow="RAG Tuning" accent="amber"
      >
        <div className="grid gap-6 xl:grid-cols-3">

          {/* 左：搜尋參數 */}
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">搜尋品質</p>

            <Field label={`Top K：${settings.rag_top_k} 段`}
              hint="每次查詢撈取的候選段落數，建議 4–10。越高召回越廣但 LLM 需處理更多。"
            >
              <Slider min={1} max={20} step={1}
                value={settings.rag_top_k}
                onChange={(v) => set("rag_top_k", v)}
                left="1" right="20"
                format={(v) => `${v} 段`}
              />
            </Field>

            <Field label={`最低相似度：${settings.min_score.toFixed(2)}`}
              hint="過濾掉語意距離過遠的 chunk。0.3 適合一般中文問答；提高至 0.5 可減少雜訊。"
            >
              <Slider min={0.0} max={0.9} step={0.05}
                value={settings.min_score}
                onChange={(v) => set("min_score", parseFloat(v.toFixed(2)))}
                left="寬鬆" right="嚴格"
                format={(v) => v.toFixed(2)}
              />
              <div className="mt-2 grid grid-cols-3 gap-1">
                {[
                  { label: "寬鬆",  value: 0.20, hint: "高召回" },
                  { label: "平衡",  value: 0.35, hint: "推薦" },
                  { label: "精準",  value: 0.55, hint: "低雜訊" },
                ].map((p) => (
                  <button key={p.label}
                    onClick={() => set("min_score", p.value)}
                    className={`rounded-xl border px-2 py-1.5 text-center text-[10px] transition-colors ${
                      Math.abs(settings.min_score - p.value) < 0.01
                        ? "border-brand-500/40 bg-brand-500/15 text-brand-300"
                        : "border-white/8 text-slate-500 hover:border-white/15 hover:text-slate-300"
                    }`}
                  >
                    <p className="font-semibold">{p.label}</p>
                    <p className="text-slate-600">{p.hint}</p>
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* 中：生成參數 */}
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">生成控制</p>

            <Field label={`溫度（Temperature）：${settings.llm_temperature.toFixed(2)}`}
              hint="控制回答的隨機性。0.1 精準引用文件；0.7 更自然但可能偏離原文。"
            >
              <Slider min={0.0} max={1.0} step={0.05}
                value={settings.llm_temperature}
                onChange={(v) => set("llm_temperature", parseFloat(v.toFixed(2)))}
                left="精準" right="創意"
                format={(v) => v.toFixed(2)}
              />
              <div className="mt-2 grid grid-cols-3 gap-1">
                {[
                  { label: "精準",  value: 0.05, hint: "引用原文" },
                  { label: "平衡",  value: 0.15, hint: "推薦" },
                  { label: "流暢",  value: 0.40, hint: "自然敘述" },
                ].map((p) => (
                  <button key={p.label}
                    onClick={() => set("llm_temperature", p.value)}
                    className={`rounded-xl border px-2 py-1.5 text-center text-[10px] transition-colors ${
                      Math.abs(settings.llm_temperature - p.value) < 0.01
                        ? "border-brand-500/40 bg-brand-500/15 text-brand-300"
                        : "border-white/8 text-slate-500 hover:border-white/15 hover:text-slate-300"
                    }`}
                  >
                    <p className="font-semibold">{p.label}</p>
                    <p className="text-slate-600">{p.hint}</p>
                  </button>
                ))}
              </div>
            </Field>

            <Field label={`最大 Token 數：${settings.llm_max_tokens}`}
              hint="單次 RAG 回答的最大生成長度。512 快速簡短；2048 詳細深入。"
            >
              <Slider min={256} max={4096} step={128}
                value={settings.llm_max_tokens}
                onChange={(v) => set("llm_max_tokens", v)}
                left="256" right="4096"
                format={(v) => `${v} tok`}
              />
              <div className="mt-2 grid grid-cols-4 gap-1">
                {[512, 1024, 2048, 4096].map((v) => (
                  <button key={v}
                    onClick={() => set("llm_max_tokens", v)}
                    className={`rounded-xl border px-1 py-1.5 text-center text-[10px] font-semibold transition-colors ${
                      settings.llm_max_tokens === v
                        ? "border-brand-500/40 bg-brand-500/15 text-brand-300"
                        : "border-white/8 text-slate-500 hover:border-white/15 hover:text-slate-300"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* 右：System Prompt 摘要 */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">System Prompt</p>
            <div className="rounded-xl border border-white/8 bg-slate-950/50 p-3">
              <p className="text-[11px] leading-4 text-slate-400 line-clamp-4">
                {settings.rag_system_prompt}
              </p>
            </div>
            <button
              onClick={() => setPromptOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 py-2 text-xs font-semibold text-brand-300 hover:bg-brand-500/20 transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              編輯 System Prompt
            </button>
            <div className="rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2">
              <p className="text-[10px] leading-4 text-slate-600">
                System Prompt 決定 LLM 如何解讀文件並回答問題。
                修改後無需重啟，儲存即生效。
              </p>
            </div>
          </div>

        </div>
      </SectionCard>

      {/* ── 現況摘要 ── */}
      <div className="panel-soft rounded-xl p-3">
        <div className="flex items-center gap-2 border-b border-white/8 pb-2 mb-3">
          <Database className="h-4 w-4 text-slate-400" />
          <p className="text-xs font-semibold text-white">目前生效設定摘要</p>
          <span className="ml-auto text-[10px] text-slate-500">儲存後即時更新</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {[
            { label: "Embed 模型",  value: settings.embed_model_name || "bge-m3" },
            { label: "LLM 模型",    value: settings.llm_model_name   || "gemma4:e4b" },
            { label: "OCR 引擎",    value: settings.ocr_engine },
            { label: "Top K",       value: String(settings.rag_top_k) },
            { label: "Temperature", value: settings.llm_temperature.toFixed(2) },
            { label: "Min Score",   value: settings.min_score.toFixed(2) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
              <p className="mt-1 truncate text-xs font-semibold text-emerald-300">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 底部儲存列 ── */}
      <div className="sticky bottom-4 z-20">
        <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-slate-900/90 px-6 py-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <p className={`text-sm ${dirty ? "text-amber-400" : "text-slate-400"}`}>
              {dirty ? "⚠ 有未儲存的變更" : "修改後點擊儲存，設定即時套用至後端。"}
            </p>
            <button onClick={handleSave} disabled={saving} className="primary-button whitespace-nowrap">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saving ? "儲存中…" : saved ? "已儲存 ✓" : "儲存設定"}
            </button>
          </div>
        </div>
      </div>

      {/* ── System Prompt 編輯 Modal ── */}
      {promptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setPromptOpen(false)} />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/12 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-brand-300" />
                <h3 className="text-sm font-semibold text-white">RAG System Prompt 編輯器</h3>
              </div>
              <button
                onClick={() => setPromptOpen(false)}
                className="ghost-button h-8 w-8 rounded-xl px-0 text-slate-400"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[11px] leading-4 text-slate-500">
                此提示詞會附加在每次 RAG 問答的最前面，指導 LLM 如何使用文件內容回答問題。
              </p>
              <textarea
                value={settings.rag_system_prompt}
                onChange={(e) => set("rag_system_prompt", e.target.value)}
                rows={12}
                className="w-full rounded-xl border border-white/12 bg-slate-950/60 px-3 py-2.5 text-xs leading-5 text-white placeholder-slate-600 focus:border-brand-500/40 focus:outline-none resize-none font-mono"
                placeholder="輸入 System Prompt…"
              />
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => {
                    set("rag_system_prompt", DEFAULT_SYSTEM_PROMPT);
                    toast.success("已還原預設 System Prompt");
                  }}
                  className="ghost-button text-xs px-3 py-1.5 rounded-xl text-slate-400"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  還原預設
                </button>
                <div className="flex gap-2">
                  <button onClick={() => setPromptOpen(false)} className="secondary-button text-xs">
                    取消
                  </button>
                  <button
                    onClick={() => { setPromptOpen(false); toast.success("Prompt 已套用，請記得儲存設定"); }}
                    className="primary-button text-xs"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    套用
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
