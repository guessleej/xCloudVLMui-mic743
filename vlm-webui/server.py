#!/usr/bin/env python3
"""
vlm-webui/server.py — xCloud RealSense D455 串流伺服器
=====================================================
支援兩種串流模式：
  MJPEG  : GET /stream   → multipart/x-mixed-replace（任何瀏覽器皆可）
  WebRTC : POST /offer   → SDP offer/answer（低延遲，需 aiortc）

端點一覽：
  GET  /           → HTML 即時影像查看頁
  GET  /stream     → MJPEG 串流
  POST /offer      → WebRTC SDP 交握（若 aiortc 已安裝）
  GET  /health     → 健康檢查
  GET  /snapshot   → 單張 JPEG 快照

環境變數：
  CAMERA_DEVICE    V4L2 裝置編號（預設 0 → /dev/video0）
  CAMERA_WIDTH     畫面寬度（預設 1280）
  CAMERA_HEIGHT    畫面高度（預設 720）
  CAMERA_FPS       目標幀率（預設 15）
  LIVE_VLM_HOST    監聽介面（預設 0.0.0.0）
  LIVE_VLM_PORT    監聽 port（預設 8090）
"""
from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import threading
import time
from typing import Optional

import cv2
from aiohttp import web

logger = logging.getLogger("vlm-webui")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# ── 設定 ─────────────────────────────────────────────────────────────
DEVICE  = int(os.getenv("CAMERA_DEVICE", "0"))
WIDTH   = int(os.getenv("CAMERA_WIDTH",  "1280"))
HEIGHT  = int(os.getenv("CAMERA_HEIGHT", "720"))
FPS     = int(os.getenv("CAMERA_FPS",    "15"))
HOST    = os.getenv("LIVE_VLM_HOST", "0.0.0.0")
PORT    = int(os.getenv("LIVE_VLM_PORT", "8090"))

JPEG_QUALITY = 80
FRAME_INTERVAL = 1.0 / FPS


# ── 攝影機執行緒（背景持續擷取，降低每個 client 的開銷）────────────────
class CameraThread(threading.Thread):
    """在背景執行緒持續擷取 frame，各 MJPEG client 共用最新 frame。"""

    def __init__(self):
        super().__init__(daemon=True, name="camera-thread")
        self._frame: Optional[bytes] = None
        self._lock  = threading.Lock()
        self._event = threading.Event()
        self._cap: Optional[cv2.VideoCapture] = None
        self._running = False

    # ── 對外介面 ─────────────────────────────────────────────────────

    def start_capture(self) -> bool:
        """標記為啟動，實際開啟動作在 run() 執行緒內完成（避免跨執行緒使用 VideoCapture）。"""
        self._running = True
        return True

    def latest_jpeg(self) -> Optional[bytes]:
        with self._lock:
            return self._frame

    def wait_frame(self, timeout: float = 2.0) -> Optional[bytes]:
        self._event.wait(timeout)
        self._event.clear()
        return self.latest_jpeg()

    def stop(self):
        self._running = False
        if self._cap:
            self._cap.release()

    # ── 裝置掃描（在執行緒內）────────────────────────────────────────

    def _open_camera(self) -> bool:
        """在背景執行緒內掃描並開啟攝影機。
        使用完整路徑字串（/dev/videoN）避免 OpenCV index 轉換問題。"""
        import numpy as np

        # 嘗試候選：優先用路徑字串（Orbbec 需要），其次用整數 index
        path_candidates = [f"/dev/video{i}" for i in range(8)]
        int_candidates  = list(range(8))

        for src in path_candidates + int_candidates:
            label = src if isinstance(src, str) else f"index={src}"
            logger.info("嘗試 %s …", label)
            try:
                cap = cv2.VideoCapture(src)
                if not cap.isOpened():
                    cap.release()
                    continue
                cap.set(cv2.CAP_PROP_FRAME_WIDTH,  WIDTH)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, HEIGHT)
                cap.set(cv2.CAP_PROP_FPS,          FPS)
                cap.set(cv2.CAP_PROP_BUFFERSIZE,   2)

                # 讀多張確認連續串流正常
                good = 0
                for attempt in range(15):
                    ret, frame = cap.read()
                    if ret and frame is not None and frame.ndim >= 2:
                        f = frame
                        if f.dtype != np.uint8:
                            f = np.clip(f, 0, 255).astype(np.uint8)
                        if f.ndim == 2:
                            f = cv2.cvtColor(f, cv2.COLOR_GRAY2BGR)
                        elif f.ndim == 3 and f.shape[2] == 1:
                            f = cv2.cvtColor(f, cv2.COLOR_GRAY2BGR)
                        elif f.ndim == 3 and f.shape[2] == 4:
                            f = cv2.cvtColor(f, cv2.COLOR_BGRA2BGR)
                        ok_enc, _ = cv2.imencode(".jpg", f)
                        if ok_enc:
                            good += 1
                            if good >= 3:   # 連續 3 張成功才確認
                                self._cap = cap
                                logger.info(
                                    "✓ 攝影機 [%s] 就緒：shape=%s dtype=%s",
                                    label, frame.shape, frame.dtype,
                                )
                                return True
                    time.sleep(0.05)
                cap.release()
                logger.debug("[%s] 連續 3 張失敗（good=%d）", label, good)
            except Exception as e:
                logger.debug("嘗試失敗 [%s]: %s", label, e)

        logger.error("所有攝影機裝置均開啟失敗")
        return False

    # ── 背景擷取迴圈 ─────────────────────────────────────────────────

    def run(self):
        import numpy as np
        # 在執行緒內開啟攝影機
        if not self._open_camera():
            logger.error("攝影機無法開啟，執行緒結束")
            return

        frame_count = 0
        warn_count  = 0
        while self._running:
            if self._cap is None or not self._cap.isOpened():
                time.sleep(1)
                continue
            ret, frame = self._cap.read()
            if not ret or frame is None:
                warn_count += 1
                if warn_count % 30 == 1:
                    logger.warning("frame 讀取失敗（已重試 %d 次）", warn_count)
                time.sleep(0.1)
                continue
            warn_count = 0

            # 確保 uint8 BGR 格式，避免 imencode 失敗
            try:
                if frame.dtype != np.uint8:
                    frame = np.clip(frame, 0, 255).astype(np.uint8)
                if frame.ndim == 2:
                    frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
                elif frame.ndim == 3 and frame.shape[2] == 1:
                    frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
                elif frame.ndim == 3 and frame.shape[2] == 4:
                    frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
            except Exception as e:
                logger.debug("frame 格式轉換失敗：%s", e)
                continue

            ok, buf = cv2.imencode(
                ".jpg", frame,
                [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY],
            )
            if ok:
                with self._lock:
                    self._frame = buf.tobytes()
                self._event.set()
                frame_count += 1
                if frame_count == 1:
                    logger.info(
                        "✓ 第一張 frame 已擷取！shape=%s dtype=%s size=%d B",
                        frame.shape, frame.dtype, len(self._frame),
                    )
            else:
                logger.warning("imencode 失敗，frame shape=%s dtype=%s", frame.shape, frame.dtype)

            time.sleep(max(0, FRAME_INTERVAL - 0.005))


camera = CameraThread()


# ── HTML 查看頁 ─────────────────────────────────────────────────────
_INDEX_HTML = f"""\
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>xCloud — livestream 即時串流</title>
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{background:#0d0d0d;color:#e0e0e0;font-family:'Courier New',monospace;
         display:flex;flex-direction:column;align-items:center;padding:24px 16px;min-height:100vh}}
    header{{text-align:center;margin-bottom:20px}}
    h1{{font-size:1.1rem;color:#4fc3f7;letter-spacing:.05em}}
    .meta{{font-size:.7rem;color:#666;margin-top:4px}}
    #feed{{width:100%;max-width:960px;border:1px solid #2a2a2a;border-radius:6px;background:#111}}
    #feed img{{width:100%;border-radius:5px;display:block}}
    .bar{{width:100%;max-width:960px;display:flex;justify-content:space-between;
          font-size:.7rem;color:#555;margin-top:8px;padding:0 4px}}
    .dot{{display:inline-block;width:8px;height:8px;border-radius:50%;
          background:#4caf50;margin-right:6px;animation:pulse 1.5s infinite}}
    @keyframes pulse{{0%,100%{{opacity:1}}50%{{opacity:.3}}}}
  </style>
</head>
<body>
  <header>
    <h1>⚙️ xCloud VLM · livestream 即時串流</h1>
    <div class="meta">/dev/video{DEVICE} &nbsp;·&nbsp; MJPEG &nbsp;·&nbsp; {WIDTH}×{HEIGHT} @ {FPS} fps</div>
  </header>
  <div id="feed">
    <img src="/stream" alt="RealSense D455 串流">
  </div>
  <div class="bar">
    <span><span class="dot"></span>即時串流</span>
    <span id="ts">--</span>
  </div>
  <script>
    setInterval(()=>document.getElementById('ts').textContent=new Date().toLocaleTimeString('zh-TW'),1000);
  </script>
</body>
</html>
"""


# ── 路由處理器 ──────────────────────────────────────────────────────

async def handle_index(request: web.Request) -> web.Response:
    return web.Response(content_type="text/html", text=_INDEX_HTML)


async def handle_health(request: web.Request) -> web.Response:
    ok = camera.latest_jpeg() is not None
    return web.json_response({
        "ok":     ok,
        "device": f"/dev/video{DEVICE}",
        "res":    f"{WIDTH}x{HEIGHT}",
        "fps":    FPS,
    }, status=200 if ok else 503)


async def handle_snapshot(request: web.Request) -> web.Response:
    jpeg = camera.latest_jpeg()
    if jpeg is None:
        return web.Response(status=503, text="攝影機未就緒")
    return web.Response(
        body=jpeg,
        content_type="image/jpeg",
        headers={"Cache-Control": "no-cache"},
    )


async def handle_mjpeg(request: web.Request) -> web.StreamResponse:
    """Multipart MJPEG 串流 — 支援任何現代瀏覽器。"""
    response = web.StreamResponse()
    response.headers.update({
        "Content-Type":  "multipart/x-mixed-replace; boundary=frame",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma":        "no-cache",
        "Connection":    "keep-alive",
        "Access-Control-Allow-Origin": "*",
    })
    await response.prepare(request)

    logger.info("MJPEG client 已連線：%s", request.remote)
    try:
        while True:
            jpeg = camera.wait_frame(timeout=2.0)
            if jpeg is None:
                # 送一個空白 frame 避免連線斷開
                await asyncio.sleep(0.1)
                continue
            boundary = (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                + f"Content-Length: {len(jpeg)}\r\n\r\n".encode()
                + jpeg
                + b"\r\n"
            )
            try:
                await response.write(boundary)
            except (ConnectionResetError, BrokenPipeError):
                break
    except asyncio.CancelledError:
        pass
    finally:
        logger.info("MJPEG client 已離線：%s", request.remote)
    return response


# ── WebRTC（選用，需安裝 aiortc）───────────────────────────────────

try:
    from aiortc import RTCPeerConnection, RTCSessionDescription
    from aiortc.contrib.media import MediaPlayer
    _AIORTC = True
    logger.info("aiortc 已載入，WebRTC 端點啟用")
except ImportError:
    _AIORTC = False
    logger.info("aiortc 未安裝，WebRTC 端點停用（MJPEG 仍可用）")

_pcs: set = set()


async def handle_offer(request: web.Request) -> web.Response:
    if not _AIORTC:
        return web.json_response({"error": "aiortc 未安裝"}, status=501)

    params = await request.json()
    offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])

    pc = RTCPeerConnection()
    _pcs.add(pc)

    @pc.on("connectionstatechange")
    async def on_state():
        logger.info("WebRTC 狀態：%s", pc.connectionState)
        if pc.connectionState in ("failed", "closed"):
            await pc.close()
            _pcs.discard(pc)

    player = MediaPlayer(f"/dev/video{DEVICE}", format="v4l2",
                         options={"video_size": f"{WIDTH}x{HEIGHT}", "framerate": str(FPS)})
    if player.video:
        pc.addTrack(player.video)

    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return web.json_response({
        "sdp":  pc.localDescription.sdp,
        "type": pc.localDescription.type,
    })


# ── 應用程式啟動 ────────────────────────────────────────────────────

async def on_startup(app: web.Application):
    if not camera.is_alive():
        ok = camera.start_capture()
        if ok:
            camera.start()
        else:
            logger.warning("攝影機啟動失敗，串流端點將回傳 503")


async def on_shutdown(app: web.Application):
    camera.stop()
    if _AIORTC:
        await asyncio.gather(*[pc.close() for pc in _pcs])


def build_app() -> web.Application:
    app = web.Application()
    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)
    app.router.add_get("/",         handle_index)
    app.router.add_get("/health",   handle_health)
    app.router.add_get("/stream",   handle_mjpeg)
    app.router.add_get("/snapshot", handle_snapshot)
    if _AIORTC:
        app.router.add_post("/offer", handle_offer)
    return app


if __name__ == "__main__":
    logger.info(
        "xCloud VLM WebUI 啟動 — /dev/video%d  %dx%d@%dfps  http://%s:%d",
        DEVICE, WIDTH, HEIGHT, FPS, HOST, PORT,
    )
    web.run_app(build_app(), host=HOST, port=PORT, access_log=None)
