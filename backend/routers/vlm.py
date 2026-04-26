"""
routers/vlm.py — VLM WebUI 狀態查詢 + 診斷代理 + WebSocket 串流推論
"""
import asyncio
import json
import logging
import httpx
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional, Any

from config import get_settings

logger   = logging.getLogger(__name__)
router   = APIRouter(prefix="/api/vlm", tags=["vlm"])
settings = get_settings()

# ── 抑制 thinking 洩漏的 system message ──────────────────────────────────────
# qwen3-vl / gemma4 等思考模型在 vision 輸入時，會把 CoT 推理塞進 delta.content。
# 加入 system 角色訊息並搭配 preamble 過濾，確保前端只收到結構化輸出。
_VLM_SYSTEM = (
    "你是工廠視覺 AI 分析師。"
    "所有輸出必須使用繁體中文（台灣）。"
    "嚴格禁止輸出任何英文（欄位值如 left/center/right/ok/warning/critical/high/medium/low 等格式標記除外）。"
    "嚴格禁止輸出思考過程、分析步驟、前言、後記。"
    "直接從【全域偵測清單】開始輸出結構化分析結果，不得有任何其他文字在前面。"
)

# ── preamble 過濾：累積 token 直到找到真正的結構化輸出起始行 ──────────────────
# 「DETECT: 」是第一條實際資料行，比 【 更可靠（模型會在 CoT 裡先寫 【全域偵測清單】 描述）
_PREAMBLE_MARKERS = ("DETECT: ", "DETECT:\t")


def _strip_preamble(buf: str) -> tuple[str, bool]:
    """
    在緩衝字串中尋找結構化輸出起始標記。
    若找到 DETECT: 開頭，補上段落標題後回傳。
    回傳 (清理後輸出, 是否已找到標記)。
    """
    for marker in _PREAMBLE_MARKERS:
        idx = buf.find(marker)
        if idx != -1:
            # 找到 DETECT: 行，往前保留最近一個 【…】 標題（若在 2 行以內）
            prefix = buf[max(0, idx - 60): idx]
            # 如果前面有 【全域偵測清單】 段落標題就保留，否則補上
            if "【" in prefix:
                header_start = prefix.rfind("【")
                return buf[idx - (len(prefix) - header_start):], True
            else:
                return "【全域偵測清單】\n" + buf[idx:], True
    return buf, False


class VlmStatusResponse(BaseModel):
    webui_ok:    bool
    llm_ok:      bool
    webui_url:   str
    llm_url:     str
    model:       Optional[str] = None


class DiagnoseRequest(BaseModel):
    prompt:       str
    image_base64: Optional[str] = None
    max_tokens:   int = 512
    temperature:  float = 0.05


class DiagnoseResponse(BaseModel):
    content:     str
    model:       Optional[str] = None
    finish_reason: Optional[str] = None


@router.get("/status", response_model=VlmStatusResponse)
async def vlm_status():
    """檢查 live-vlm-webui 與 llama.cpp 服務可用性"""
    webui_ok = llm_ok = False
    model    = None

    # 測試 live-vlm-webui
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(f"{settings.vlm_webui_url}/")
            webui_ok = r.status_code < 500
    except Exception as e:
        logger.debug("vlm-webui not reachable: %s", str(e))

    # 測試 llama.cpp
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(f"{settings.llm_base_url}/v1/models")
            if r.status_code == 200:
                llm_ok = True
                data   = r.json()
                models = data.get("data", [])
                if models:
                    model = models[0].get("id")
    except Exception as e:
        logger.debug("llama.cpp not reachable: %s", str(e))

    return VlmStatusResponse(
        webui_ok=  webui_ok,
        llm_ok=    llm_ok,
        webui_url= settings.vlm_webui_url,
        llm_url=   settings.llm_base_url,
        model=     model,
    )


@router.post("/diagnose", response_model=DiagnoseResponse)
async def vlm_diagnose(payload: DiagnoseRequest):
    """
    直接呼叫 llama.cpp /v1/chat/completions 進行圖文診斷。
    若有 image_base64，附加為 vision message。
    """
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": _VLM_SYSTEM},
    ]

    if payload.image_base64:
        messages.append({
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{payload.image_base64}"},
                },
                {"type": "text", "text": payload.prompt},
            ],
        })
    else:
        messages.append({"role": "user", "content": payload.prompt})

    # 思考模型在 stream=True 時 delta.content 才有實際輸出
    effective_max = max(payload.max_tokens, 1024)
    model_name    = settings.vlm_model

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=5.0)
        ) as c:
            content_parts: list[str] = []
            finish_reason: str | None = None
            model_id: str | None = None
            preamble_buf  = ""
            preamble_done = False

            async with c.stream(
                "POST",
                f"{settings.llm_base_url}/v1/chat/completions",
                json={
                    "model":       model_name,
                    "messages":    messages,
                    "max_tokens":  effective_max,
                    "temperature": payload.temperature,
                    "stream":      True,
                },
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload_str = line[6:].strip()
                    if payload_str == "[DONE]":
                        break
                    try:
                        chunk  = json.loads(payload_str)
                        if not model_id:
                            model_id = chunk.get("model")
                        choice = chunk["choices"][0]
                        token  = choice.get("delta", {}).get("content", "")
                        fr     = choice.get("finish_reason")
                        if token:
                            if preamble_done:
                                content_parts.append(token)
                            else:
                                preamble_buf += token
                                clean, found = _strip_preamble(preamble_buf)
                                if found:
                                    preamble_done = True
                                    preamble_buf  = ""
                                    if clean:
                                        content_parts.append(clean)
                                    # 若緩衝超過 800 字仍未見標記，強制放行
                                elif len(preamble_buf) > 800:
                                    preamble_done = True
                                    content_parts.append(preamble_buf)
                                    preamble_buf  = ""
                        if fr:
                            finish_reason = fr
                    except (json.JSONDecodeError, KeyError, IndexError):
                        pass

            # stream=True 無 content → 回退 stream=False
            if not content_parts:
                r2 = await c.post(
                    f"{settings.llm_base_url}/v1/chat/completions",
                    json={
                        "model":       model_name,
                        "messages":    messages,
                        "max_tokens":  effective_max,
                        "temperature": payload.temperature,
                        "stream":      False,
                    },
                )
                r2.raise_for_status()
                d2     = r2.json()
                ch2    = d2["choices"][0]
                msg2   = ch2.get("message", {})
                raw    = msg2.get("content") or msg2.get("reasoning") or ""
                clean, _ = _strip_preamble(raw)
                content_parts = [clean or raw]
                finish_reason = ch2.get("finish_reason")
                model_id      = d2.get("model")

            return DiagnoseResponse(
                content=       "".join(content_parts),
                model=         model_id,
                finish_reason= finish_reason,
            )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"llama.cpp 回應錯誤 HTTP {e.response.status_code}",
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="無法連線至 llama.cpp（:8080），請確認服務已啟動。",
        )


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket 串流推論端點
# 協定（Client → Server）:
#   {"image_base64": "<b64>", "prompt": "...", "max_tokens": 256, "temperature": 0.05}
#   {"type": "pong"}   ← 回應 server 的 ping
# 協定（Server → Client）:
#   {"type": "start"}
#   {"type": "token",  "content": "..."}   ← 逐 token 即時輸出（已濾除 preamble）
#   {"type": "done",   "finish_reason": "stop"}
#   {"type": "skip",   "message": "..."}   ← 上一幀推論中，略過此幀
#   {"type": "error",  "message": "..."}
#   {"type": "ping"}                        ← 保活 ping（client 需回 pong）
# ─────────────────────────────────────────────────────────────────────────────
@router.websocket("/ws")
async def vlm_websocket_stream(websocket: WebSocket):
    """瀏覽器攝影機串流推論 — 支援筆電、手機、平板（任何支援 WebRTC 的瀏覽器）"""
    await websocket.accept()
    logger.info("VLM WebSocket 連線建立 — client: %s", websocket.client)

    inference_lock = asyncio.Lock()

    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
                continue

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "無效的 JSON 格式"})
                continue

            if data.get("type") == "pong":
                continue

            image_b64   = data.get("image_base64")
            prompt      = data.get("prompt", "請分析這張圖片中的設備狀況，識別任何異常或需要注意的地方。")
            max_tokens  = min(int(data.get("max_tokens", 256)), settings.llm_max_tokens)
            temperature = float(data.get("temperature", 0.05))

            if inference_lock.locked():
                await websocket.send_json({"type": "skip", "message": "推論中，略過此幀"})
                continue

            async with inference_lock:
                VLM_MODEL = settings.vlm_model

                # ── 組建訊息（加入 system 訊息抑制 thinking 洩漏）──────────
                messages: list[dict[str, Any]] = [
                    {"role": "system", "content": _VLM_SYSTEM},
                ]
                if image_b64:
                    messages.append({
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                            },
                            {"type": "text", "text": prompt},
                        ],
                    })
                else:
                    messages.append({"role": "user", "content": prompt})

                await websocket.send_json({"type": "start"})

                try:
                    async with httpx.AsyncClient(
                        timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=5.0)
                    ) as client:
                        effective_max_tokens = max(max_tokens, 1024)

                        async with client.stream(
                            "POST",
                            f"{settings.llm_base_url}/v1/chat/completions",
                            json={
                                "model":       VLM_MODEL,
                                "messages":    messages,
                                "max_tokens":  effective_max_tokens,
                                "temperature": temperature,
                                "stream":      True,
                            },
                        ) as resp:
                            if resp.status_code != 200:
                                await websocket.send_json({
                                    "type": "error",
                                    "message": f"推論引擎回應 HTTP {resp.status_code}",
                                })
                                continue

                            finish        = "stop"
                            content_buf   = []          # 已通過 preamble 過濾的 token
                            preamble_buf  = ""          # 等待標記的緩衝區
                            preamble_done = False       # 是否已找到起始標記

                            async for line in resp.aiter_lines():
                                if not line.startswith("data: "):
                                    continue
                                payload_ws = line[6:].strip()
                                if payload_ws == "[DONE]":
                                    break
                                try:
                                    chunk  = json.loads(payload_ws)
                                    choice = chunk["choices"][0]
                                    delta  = choice.get("delta", {})
                                    token  = delta.get("content", "")
                                    fr     = choice.get("finish_reason")
                                    if fr:
                                        finish = fr

                                    if token:
                                        if preamble_done:
                                            # 正常串流輸出
                                            content_buf.append(token)
                                            await websocket.send_json(
                                                {"type": "token", "content": token}
                                            )
                                        else:
                                            # 緩衝等待起始標記
                                            preamble_buf += token
                                            clean, found = _strip_preamble(preamble_buf)
                                            if found:
                                                preamble_done = True
                                                preamble_buf  = ""
                                                content_buf.append(clean)
                                                await websocket.send_json(
                                                    {"type": "token", "content": clean}
                                                )
                                            elif len(preamble_buf) > 800:
                                                # 超過 800 字未見標記 → 強制放行
                                                logger.warning(
                                                    "VLM preamble 超過 800 字仍未見標記，強制放行"
                                                )
                                                preamble_done = True
                                                content_buf.append(preamble_buf)
                                                await websocket.send_json(
                                                    {"type": "token", "content": preamble_buf}
                                                )
                                                preamble_buf = ""
                                except (json.JSONDecodeError, KeyError, IndexError):
                                    pass

                        # stream=True 無 content → 回退 stream=False
                        if not content_buf:
                            logger.warning("VLM stream 無 content token，回退 stream=False")
                            r2 = await client.post(
                                f"{settings.llm_base_url}/v1/chat/completions",
                                json={
                                    "model":       VLM_MODEL,
                                    "messages":    messages,
                                    "max_tokens":  effective_max_tokens,
                                    "temperature": temperature,
                                    "stream":      False,
                                },
                            )
                            if r2.status_code == 200:
                                d2    = r2.json()
                                ch2   = d2["choices"][0]
                                msg2  = ch2.get("message", {})
                                raw   = msg2.get("content") or msg2.get("reasoning") or ""
                                clean, _ = _strip_preamble(raw)
                                text2 = clean or raw
                                finish = ch2.get("finish_reason", "stop")
                                if text2:
                                    await websocket.send_json({"type": "token", "content": text2})

                        await websocket.send_json({"type": "done", "finish_reason": finish})

                except httpx.ConnectError:
                    await websocket.send_json({
                        "type": "error",
                        "message": "無法連線至推論引擎，請確認 llama.cpp 服務是否已啟動。",
                    })
                except httpx.ReadTimeout:
                    await websocket.send_json({
                        "type": "error",
                        "message": "推論逾時（>120s），請縮短提示詞或減少 max_tokens。",
                    })
                except Exception as exc:
                    logger.exception("VLM WebSocket 推論錯誤")
                    await websocket.send_json({
                        "type": "error",
                        "message": f"推論錯誤：{type(exc).__name__}",
                    })

    except WebSocketDisconnect:
        logger.info("VLM WebSocket 連線中斷 — client: %s", websocket.client)
    except Exception:
        logger.exception("VLM WebSocket 未預期錯誤")
