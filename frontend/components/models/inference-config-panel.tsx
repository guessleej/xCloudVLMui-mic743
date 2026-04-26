"use client";

/**
 * InferenceConfigPanel
 * YOLO 推論參數設定面板 — 讓一般使用者直觀設定推論行為
 *
 * 參數分組：
 *   偵測精度   conf / iou / max_det / agnostic_nms
 *   影像輸入   imgsz / augment
 *   運算效能   half / batch
 *   類別過濾   classes (null=全部 | 勾選特定 class_id)
 *   視覺化     line_width / show_labels / show_conf / font_size
 *
 * 預設設定檔（Preset）：
 *   即時偵測 / 精準分析 / 平衡模式 / 工廠巡檢
 */

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  Layers,
  Loader2,
  MonitorPlay,
  RefreshCw,
  Save,
  Settings2,
  Sliders,
  X,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { modelsApi } from "@/lib/api";
import type { InferenceConfig, TrainedModel } from "@/types";

/* ── 預設值 ──────────────────────────────────────────────────────── */
export const DEFAULT_INFERENCE_CONFIG: InferenceConfig = {
  conf:         0.25,
  iou:          0.70,
  max_det:      300,
  imgsz:        640,
  augment:      false,
  agnostic_nms: false,
  half:         false,
  batch:        1,
  classes:      null,
  line_width:   2,
  show_labels:  true,
  show_conf:    true,
  font_size:    1.0,
};

/* ── 預設設定檔 ──────────────────────────────────────────────────── */
interface Preset {
  id:     string;
  label:  string;
  icon:   string;
  desc:   string;
  config: Partial<InferenceConfig>;
}
const PRESETS: Preset[] = [
  {
    id: "realtime", label: "即時偵測", icon: "⚡", desc: "低延遲 · 適合即時監控",
    config: { conf:0.30, iou:0.60, imgsz:320, half:true,  max_det:100, augment:false, agnostic_nms:false },
  },
  {
    id: "accurate", label: "精準分析", icon: "🎯", desc: "高精度 · 適合靜態巡檢",
    config: { conf:0.15, iou:0.45, imgsz:640, half:false, max_det:300, augment:true,  agnostic_nms:true  },
  },
  {
    id: "balanced", label: "平衡模式", icon: "⚖️", desc: "預設 · 兼顧速度與精度",
    config: { conf:0.25, iou:0.70, imgsz:640, half:false, max_det:300, augment:false, agnostic_nms:false },
  },
  {
    id: "factory",  label: "工廠巡檢", icon: "🏭", desc: "減少誤報 · 適合工廠場景",
    config: { conf:0.35, iou:0.65, imgsz:480, half:true,  max_det:150, augment:false, agnostic_nms:false },
  },
];

const IMGSZ_OPTIONS = [320, 416, 480, 512, 640, 736, 1280];

/* ── Toggle 元件 ─────────────────────────────────────────────────── */
function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-40 ${
        value ? "bg-brand-600" : "bg-white/15"
      }`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
        value ? "translate-x-4" : "translate-x-0.5"
      }`} />
    </button>
  );
}

/* ── Slider 元件 ─────────────────────────────────────────────────── */
function ParamSlider({
  label, desc, value, min, max, step, displayFn, onChange,
}: {
  label: string; desc: string;
  value: number; min: number; max: number; step: number;
  displayFn?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-medium text-slate-200">{label}</span>
          <p className="text-[11px] text-slate-500">{desc}</p>
        </div>
        <span className="min-w-[52px] text-right text-sm font-semibold text-brand-300">
          {displayFn ? displayFn(value) : value}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-white/8">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brand-500/60"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

/* ── Section 折疊元件 ────────────────────────────────────────────── */
function Section({
  icon, title, defaultOpen = true, children,
}: {
  icon: React.ReactNode; title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/8 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-white/[0.03]"
      >
        <span className="text-slate-400">{icon}</span>
        <span className="flex-1 text-xs font-semibold text-slate-300">{title}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
      </button>
      {open && (
        <div className="border-t border-white/6 px-4 pb-4 pt-3 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

/* ── 主元件 ──────────────────────────────────────────────────────── */
interface InferenceConfigPanelProps {
  model:    TrainedModel;
  onClose:  () => void;
  onSaved:  (updated: TrainedModel) => void;
}

export function InferenceConfigPanel({ model, onClose, onSaved }: InferenceConfigPanelProps) {
  const [cfg, setCfg] = useState<InferenceConfig>(
    () => ({ ...DEFAULT_INFERENCE_CONFIG, ...(model.inference_config ?? {}) })
  );
  const [saving, setSaving] = useState(false);
  const [dirty,  setDirty]  = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // 每次 model 切換時重設
  useEffect(() => {
    setCfg({ ...DEFAULT_INFERENCE_CONFIG, ...(model.inference_config ?? {}) });
    setDirty(false);
    setActivePreset(null);
  }, [model.id]);

  const set = useCallback(<K extends keyof InferenceConfig>(key: K, val: InferenceConfig[K]) => {
    setCfg((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
    setActivePreset(null);
  }, []);

  const applyPreset = useCallback((preset: Preset) => {
    setCfg((prev) => ({ ...prev, ...preset.config }));
    setActivePreset(preset.id);
    setDirty(true);
  }, []);

  const reset = () => {
    setCfg({ ...DEFAULT_INFERENCE_CONFIG, ...(model.inference_config ?? {}) });
    setDirty(false);
    setActivePreset(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await modelsApi.update(model.id, { inference_config: cfg });
      onSaved(res.data);
      setDirty(false);
      toast.success("推論參數已儲存。");
    } catch {
      toast.error("儲存失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  };

  const meta_color =
    model.task_type === "detect"   ? "text-brand-300"   :
    model.task_type === "pose"     ? "text-emerald-300" :
    model.task_type === "segment"  ? "text-purple-300"  :
    model.task_type === "classify" ? "text-amber-300"   :
    "text-rose-300";

  const classNames = model.class_names ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-brand-400" />
            <span className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Inference Config</span>
          </div>
          <p className={`mt-0.5 truncate text-sm font-semibold ${meta_color}`}>{model.name}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {dirty && (
            <button onClick={reset} title="復原" className="ghost-button h-8 w-8 rounded-[12px] px-0 text-slate-500 hover:text-white">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-500 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "儲存中…" : "儲存"}
          </button>
          <button onClick={onClose} className="ghost-button h-8 w-8 rounded-[12px] px-0 text-slate-500">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── 內容捲動區 ── */}
      <div className="flex-1 overflow-y-auto space-y-3 p-3">

        {/* ── 預設設定檔 ── */}
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">快速設定檔</p>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                  activePreset === preset.id
                    ? "border-brand-400/40 bg-brand-500/15"
                    : "border-white/8 bg-white/[0.03] hover:border-white/15"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-base">{preset.icon}</span>
                  <span className={`text-xs font-semibold ${activePreset === preset.id ? "text-brand-300" : "text-slate-200"}`}>
                    {preset.label}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">{preset.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── 1. 偵測精度 ── */}
        <Section icon={<Activity className="h-3.5 w-3.5" />} title="偵測精度">
          <ParamSlider
            label="信心閾值 (conf)"
            desc="低於此值的偵測框將被丟棄"
            value={cfg.conf} min={0.05} max={0.95} step={0.05}
            displayFn={(v) => v.toFixed(2)}
            onChange={(v) => set("conf", v)}
          />
          <ParamSlider
            label="IoU 閾值 (iou)"
            desc="NMS 重疊消除閾值 — 越低越嚴格"
            value={cfg.iou} min={0.10} max={0.95} step={0.05}
            displayFn={(v) => v.toFixed(2)}
            onChange={(v) => set("iou", v)}
          />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-200">最大偵測數 (max_det)</label>
            <p className="text-[11px] text-slate-500">每幀最多輸出幾個偵測框（E2E 最大 300）</p>
            <input
              type="number" min={1} max={1000}
              value={cfg.max_det}
              onChange={(e) => set("max_det", parseInt(e.target.value) || 300)}
              className="w-24 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-brand-500/40 focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-200">跨類別 NMS (agnostic_nms)</p>
              <p className="text-[11px] text-slate-500">不同類別的框也會互相抑制</p>
            </div>
            <Toggle value={cfg.agnostic_nms} onChange={(v) => set("agnostic_nms", v)} />
          </div>
        </Section>

        {/* ── 2. 影像輸入 ── */}
        <Section icon={<MonitorPlay className="h-3.5 w-3.5" />} title="影像輸入">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-200">推論尺寸 (imgsz)</label>
            <p className="text-[11px] text-slate-500">越小越快、越大越精確（影響 VRAM/RAM）</p>
            <div className="flex flex-wrap gap-2 pt-0.5">
              {IMGSZ_OPTIONS.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => set("imgsz", sz)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    cfg.imgsz === sz
                      ? "border-brand-400/40 bg-brand-500/20 text-brand-300"
                      : "border-white/8 text-slate-400 hover:text-white"
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-200">TTA 增強 (augment)</p>
              <p className="text-[11px] text-slate-500">測試時多尺度翻轉，精度↑ 速度↓</p>
            </div>
            <Toggle value={cfg.augment} onChange={(v) => set("augment", v)} />
          </div>
        </Section>

        {/* ── 3. 運算效能 ── */}
        <Section icon={<Zap className="h-3.5 w-3.5" />} title="運算效能">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-200">FP16 半精度 (half)</p>
              <p className="text-[11px] text-slate-500">需 CUDA GPU，速度↑ 約 2× ，精度略降</p>
            </div>
            <Toggle value={cfg.half} onChange={(v) => set("half", v)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-200">批次大小 (batch)</label>
            <p className="text-[11px] text-slate-500">一次推論的影像數（即時監控建議設 1）</p>
            <div className="flex gap-2">
              {[1, 2, 4, 8, 16].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => set("batch", b)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    cfg.batch === b
                      ? "border-brand-400/40 bg-brand-500/20 text-brand-300"
                      : "border-white/8 text-slate-400 hover:text-white"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* ── 4. 類別過濾 ── */}
        <Section icon={<Layers className="h-3.5 w-3.5" />} title="類別過濾" defaultOpen={false}>
          <div className="space-y-2">
            <p className="text-[11px] text-slate-500">
              選擇要偵測的類別（不選擇 = 全部 80 類）。勾選後只回傳選定類別的偵測框。
            </p>
            <button
              type="button"
              onClick={() => { set("classes", null); }}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                cfg.classes === null
                  ? "border-brand-400/40 bg-brand-500/20 text-brand-300"
                  : "border-white/8 text-slate-400 hover:text-white"
              }`}
            >
              全部類別（預設）
            </button>
            {classNames.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-white/8 bg-slate-950/30 p-2">
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {classNames.map((name, idx) => {
                    const selected = Array.isArray(cfg.classes) && cfg.classes.includes(idx);
                    return (
                      <label key={idx} className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            const current = Array.isArray(cfg.classes) ? [...cfg.classes] : [];
                            if (e.target.checked) {
                              set("classes", [...current, idx].sort((a, b) => a - b));
                            } else {
                              const next = current.filter((c) => c !== idx);
                              set("classes", next.length ? next : null);
                            }
                          }}
                          className="h-3 w-3 rounded accent-brand-500"
                        />
                        <span className="text-[11px] text-slate-400">{idx}: {name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {classNames.length === 0 && (
              <p className="text-[11px] text-slate-600">此模型未設定類別清單，無法個別過濾。</p>
            )}
          </div>
        </Section>

        {/* ── 5. 視覺化顯示 ── */}
        <Section icon={<Eye className="h-3.5 w-3.5" />} title="視覺化顯示" defaultOpen={false}>
          <ParamSlider
            label="邊框粗細 (line_width)"
            desc="偵測框繪製線條寬度（px）"
            value={cfg.line_width} min={1} max={8} step={1}
            displayFn={(v) => `${v}px`}
            onChange={(v) => set("line_width", v)}
          />
          <ParamSlider
            label="字體大小 (font_size)"
            desc="標籤文字縮放倍率"
            value={cfg.font_size} min={0.5} max={2.0} step={0.1}
            displayFn={(v) => `×${v.toFixed(1)}`}
            onChange={(v) => set("font_size", Math.round(v * 10) / 10)}
          />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-200">顯示類別標籤 (show_labels)</p>
              <p className="text-[11px] text-slate-500">在偵測框旁顯示類別名稱</p>
            </div>
            <Toggle value={cfg.show_labels} onChange={(v) => set("show_labels", v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-200">顯示信心分數 (show_conf)</p>
              <p className="text-[11px] text-slate-500">在偵測框旁顯示信心度百分比</p>
            </div>
            <Toggle value={cfg.show_conf} onChange={(v) => set("show_conf", v)} />
          </div>
        </Section>

        {/* ── 當前設定摘要 ── */}
        <div className="rounded-xl border border-white/6 bg-slate-950/30 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">當前設定摘要</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              { k: "conf",    v: cfg.conf.toFixed(2)    },
              { k: "iou",     v: cfg.iou.toFixed(2)     },
              { k: "max_det", v: cfg.max_det            },
              { k: "imgsz",   v: `${cfg.imgsz}px`       },
              { k: "half",    v: cfg.half ? "FP16" : "FP32" },
              { k: "classes", v: cfg.classes ? `${cfg.classes.length}類` : "全部" },
            ].map(({ k, v }) => (
              <div key={k} className="rounded-lg border border-white/6 px-2.5 py-1.5 text-center">
                <p className="text-[10px] text-slate-600">{k}</p>
                <p className="mt-0.5 font-semibold text-white">{v}</p>
              </div>
            ))}
          </div>
          {dirty && (
            <p className="mt-2 text-center text-[11px] text-brand-400">⚠️ 有未儲存的變更</p>
          )}
        </div>
      </div>
    </div>
  );
}
