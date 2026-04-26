"use client";

/**
 * ReportAccordion
 * 將 VLM 報告 Markdown 內容依 【...】 區塊拆解為折疊式手風琴面板。
 *
 * 解析邏輯：
 *  1. 提取 H1 / 前言摘要（時間、風險、耗時）→ 固定顯示的摘要列
 *  2. 偵測「推論提示：」段落 → 預設折疊（內容太長）
 *  3. 依 【xxx】 標記切割剩餘內容為各子區塊
 *  4. 關鍵評分區塊（診斷摘要、風險矩陣）預設展開
 */

import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";

/* ── 區塊定義 ────────────────────────────────────────────────────── */
interface AccordionSection {
  id:          string;
  title:       string;
  icon:        string;
  content:     string;
  defaultOpen: boolean;
  accent:      string;  // tailwind text color class
}

/* ── 區塊設定表 ─────────────────────────────────────────────────── */
const SECTION_META: Record<string, { icon: string; accent: string; defaultOpen: boolean }> = {
  "全域偵測清單":  { icon: "🔍", accent: "text-slate-300",  defaultOpen: false },
  "設備健康評分":  { icon: "🔧", accent: "text-blue-400",   defaultOpen: true  },
  "人員工安評估":  { icon: "👷", accent: "text-yellow-400", defaultOpen: true  },
  "5S 審計評分":   { icon: "📋", accent: "text-teal-400",   defaultOpen: true  },
  "5S審計評分":    { icon: "📋", accent: "text-teal-400",   defaultOpen: true  },
  "環境安全評估":  { icon: "🌍", accent: "text-green-400",  defaultOpen: true  },
  "風險矩陣評估":  { icon: "⚠️", accent: "text-orange-400", defaultOpen: true  },
  "全面診斷摘要":  { icon: "📊", accent: "text-red-400",    defaultOpen: true  },
  "推論提示":      { icon: "💬", accent: "text-slate-500",  defaultOpen: false },
};

/* ── 解析函式 ────────────────────────────────────────────────────── */
function parseReportContent(markdown: string): {
  preamble: string;
  sections: AccordionSection[];
} {
  // 分離「推論提示：」段落（從「推論提示：」到下一個空行 + 非縮排內容結束）
  let body = markdown;
  let promptContent = "";

  const promptMatch = body.match(/([\*_]*推論提示[：:][\*_]*)([\s\S]*?)(?=\n#{1,3}\s|\n影像推論分析|\n【|$)/);
  if (promptMatch) {
    promptContent = promptMatch[2].trim();
    body = body.replace(promptMatch[0], "").trim();
  }

  // 切割 【xxx】 區塊：使用正向預查保留標記
  const SECTION_SPLIT = /(?=【[^】]{1,20}】)/;
  const parts = body.split(SECTION_SPLIT);

  // 第一段（沒有 【】 的）= 前言
  const preambleRaw = parts[0] || "";
  const sectionParts = parts.slice(1);

  // 清理前言：移除「影像推論分析」標題行（它是 VLM 輸出的冗余標頭）
  const preamble = preambleRaw
    .replace(/\n?影像推論分析\n?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 建立 sections
  const sections: AccordionSection[] = [];

  // 1. 推論提示（若有）
  if (promptContent) {
    sections.push({
      id:          "prompt",
      title:       "推論提示（原始 Prompt）",
      icon:        "💬",
      content:     promptContent,
      defaultOpen: false,
      accent:      "text-slate-500",
    });
  }

  // 2. 其餘 【xxx】 區塊
  for (const part of sectionParts) {
    const titleMatch = part.match(/^【([^】]+)】/);
    if (!titleMatch) continue;

    const rawTitle = titleMatch[1].trim();
    const content  = part.slice(titleMatch[0].length).trim();
    const meta     = SECTION_META[rawTitle]
      ?? { icon: "📄", accent: "text-slate-300", defaultOpen: false };

    sections.push({
      id:          rawTitle,
      title:       rawTitle,
      icon:        meta.icon,
      content,
      defaultOpen: meta.defaultOpen,
      accent:      meta.accent,
    });
  }

  return { preamble, sections };
}

/* ── 前言摘要列 ─────────────────────────────────────────────────── */
function PreambleSummary({ markdown }: { markdown: string }) {
  // 擷取巡檢時間、耗時、風險等級 → 顯示為 chip 列
  const timeMatch    = markdown.match(/巡檢時間[：:]\s*([^\n\|]+)/);
  const durationMatch= markdown.match(/推論耗時[：:]\s*([^\n\|]+)/);
  const riskMatch    = markdown.match(/風險等級[：:]\s*([^\n\|]+)/);

  const chips = [
    timeMatch     && { label: "巡檢時間", value: timeMatch[1].trim() },
    durationMatch && { label: "推論耗時", value: durationMatch[1].trim() },
    riskMatch     && { label: "風險等級", value: riskMatch[1].trim() },
  ].filter(Boolean) as { label: string; value: string }[];

  if (!chips.length) {
    // 前言沒有特定 chip，直接渲染短版 Markdown（最多4行）
    const shortMd = markdown.split("\n").slice(0, 4).join("\n");
    return (
      <div className="prose prose-invert prose-sm max-w-none opacity-80">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{shortMd}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <div key={c.label} className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-1.5 text-xs">
          <span className="text-slate-500">{c.label}：</span>
          <span className="font-medium text-slate-200">{c.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── 單一折疊面板 ────────────────────────────────────────────────── */
function AccordionPanel({
  section,
  isOpen,
  onToggle,
}: {
  section: AccordionSection;
  isOpen:  boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`rounded-xl border transition-colors ${
      isOpen ? "border-white/12 bg-white/[0.03]" : "border-white/6 bg-transparent"
    }`}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base leading-none">{section.icon}</span>
          <span className={`text-sm font-semibold ${section.accent}`}>
            {section.title}
          </span>
          {!isOpen && section.content && (
            <span className="hidden truncate max-w-[180px] text-xs text-slate-600 sm:inline">
              {section.content.replace(/\n/g, " ").slice(0, 60)}…
            </span>
          )}
        </div>
        <span className="shrink-0 text-slate-500">
          {isOpen
            ? <ChevronDown className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />
          }
        </span>
      </button>

      {/* Content */}
      {isOpen && (
        <div className="border-t border-white/6 px-4 pb-4 pt-3">
          <div className="prose prose-invert prose-sm max-w-none
            prose-code:rounded prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs
            prose-pre:bg-slate-950/50 prose-pre:border prose-pre:border-white/8
            prose-table:w-full prose-th:text-left prose-th:text-xs prose-td:text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {section.content}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 主元件 ─────────────────────────────────────────────────────── */
interface ReportAccordionProps {
  markdown: string;
  /** compact 模式：隱藏前言摘要，只顯示折疊面板（用於列表頁預覽） */
  compact?: boolean;
}

export function ReportAccordion({ markdown, compact = false }: ReportAccordionProps) {
  const { preamble, sections } = parseReportContent(markdown);

  // 初始開關狀態
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const s of sections) map[s.id] = s.defaultOpen;
    return map;
  });

  const toggleSection = useCallback((id: string) => {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const allOpen   = sections.every((s) => openMap[s.id]);
  const allClosed = sections.every((s) => !openMap[s.id]);

  function expandAll()  { setOpenMap(Object.fromEntries(sections.map((s) => [s.id, true]))); }
  function collapseAll(){ setOpenMap(Object.fromEntries(sections.map((s) => [s.id, false]))); }

  if (!sections.length) {
    // 無結構化區塊：退化為純 Markdown 渲染
    return (
      <div className="prose prose-invert prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 前言摘要列 */}
      {!compact && preamble && (
        <div className="mb-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
          <PreambleSummary markdown={preamble} />
        </div>
      )}

      {/* 展開/折疊全部 */}
      <div className="flex items-center justify-end gap-2 pb-1">
        <button
          onClick={allClosed ? expandAll : collapseAll}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
        >
          {allClosed
            ? <><ChevronsUpDown className="h-3.5 w-3.5" />展開全部</>
            : <><ChevronsDownUp className="h-3.5 w-3.5" />折疊全部</>
          }
        </button>
      </div>

      {/* Accordion 面板 */}
      <div className="space-y-1.5">
        {sections.map((section) => (
          <AccordionPanel
            key={section.id}
            section={section}
            isOpen={!!openMap[section.id]}
            onToggle={() => toggleSection(section.id)}
          />
        ))}
      </div>
    </div>
  );
}
