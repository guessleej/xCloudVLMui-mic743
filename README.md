<!-- xCloudVLMui — MIC-743 README -->
<div align="center">

# xCloudVLMui Platform — MIC-743

**工廠設備健康管理平台 · 工廠視覺 AI 指揮台**

[![Platform](https://img.shields.io/badge/Platform-Advantech%20MIC--743-orange)]()
[![SoM](https://img.shields.io/badge/SoM-Jetson%20Thor%20AGX-76b900?logo=nvidia&logoColor=white)]()
[![CUDA](https://img.shields.io/badge/CUDA-12.6%20Blackwell-76b900?logo=nvidia&logoColor=white)]()
[![AI](https://img.shields.io/badge/AI-2%2C070%20FP4%20TFLOPs-ff6600)]()
[![RAM](https://img.shields.io/badge/RAM-128GB%20LPDDR5X-blue)]()
[![Python](https://img.shields.io/badge/Python-3.11-3776ab?logo=python&logoColor=white)]()
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?logo=fastapi&logoColor=white)]()
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white)]()
[![Docker](https://img.shields.io/badge/Docker-Compose%20v2-2496ED?logo=docker&logoColor=white)]()

> 由 **云碩科技 xCloudinfo Corp.Limited** 開發
> 專為 **Advantech MIC-743-AT / NVIDIA Jetson AGX Thor (T5000)** 優化的邊緣 AI 部署版本

</div>

---

## 硬體規格 — Advantech MIC-743-AT

| 項目 | 規格 |
|------|------|
| **硬體平台** | Advantech MIC-743-AT Edge AI Inference System |
| **SoM** | NVIDIA Jetson AGX Thor T5000 |
| **CPU** | 14-core ARM Neoverse V3AE 64-bit |
| **CPU 快取** | L1: 64KB+64KB/核 · L2: 1MB/核 · L3: 16MB |
| **GPU** | NVIDIA Blackwell — 2,560 CUDA Cores + 96 Tensor Cores (Gen5) |
| **GPU 頻率** | 最高 1.57 GHz |
| **AI 效能** | **2,070 FP4 TFLOPs** |
| **記憶體** | **128 GB LPDDR5X Unified Memory**（CPU + GPU 共享）|
| **儲存** | 1 TB NVMe SSD |
| **作業系統** | Ubuntu 22.04（L4T R38.x）|
| **JetPack** | 7.x |
| **CUDA** | 12.6 |
| **TensorRT** | 10.x |
| **cuDNN** | 9.x |
| **網路** | 100G QSFP28 + 1× 5GbE RJ45 + 4× 25GbE QSFP28 |
| **USB** | 4× USB 3.2 Gen2 + 1× Micro USB OTG |
| **工業 I/O** | 4× CAN + I2C + 1× Nano SIM |

> MIC-743-AT 是 NVIDIA Jetson AGX Thor 首批工業級 AI 推論系統，
> 專為 VLM / LLM 邊緣運算、實體 AI 與機器人應用設計。

---

## 服務架構與 Port 配置

```
┌──────────────────────────────────────────────────────────────────┐
│                  MIC-743 / Jetson AGX Thor T5000                 │
│                                                                  │
│  ┌─ [7] nginx :8780 ──────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  ┌─ [6] frontend :3200 ─────────────────────────────────┐ │  │
│  │  │  Next.js 14 · 視覺巡檢 · MQTT · RAG · 模型管理       │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  │                                                            │  │
│  │  ┌─ [5] backend :8101 ──────────────────────────────────┐ │  │
│  │  │  FastAPI · SQLite · ChromaDB · RAG · MQTT             │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ [3] llama-cpp :18180 ─────────────────────────────────────┐  │
│  │  Gemma 4 E4B Q4_K_M · CUDA 12.6 · Blackwell GPU           │  │
│  │  n-gpu-layers=99 · flash-attn · ctx=128K · mlock           │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ [4] vlm-webui :8190 ──┐  ┌─ [2] mosquitto :1884 ─────────┐  │
│  │  WebRTC 視覺串流        │  │  MQTT Broker · IoT 感測器      │  │
│  └────────────────────────┘  └───────────────────────────────┘  │
│                                                                  │
│  ┌─ [8] cadvisor :8191 ───────────────────────────────────────┐  │
│  │  Blackwell GPU + 容器資源監控                               │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

| 服務 | 外部 Port | 內部 Port | 說明 |
|------|-----------|-----------|------|
| nginx（主要入口）| **8780** | 80 | 反向代理統一入口 |
| nginx（HTTPS）| 8743 | 443 | SSL 入口 |
| backend API | 8101 | 8000 | FastAPI + RAG + MQTT |
| frontend | 3200 | 3000 | Next.js 儀表板 |
| llama-cpp | 18180 | 8080 | Blackwell CUDA 推論 |
| vlm-webui | 8190 | 8090 | WebRTC 視覺串流 |
| cadvisor | 8191 | 8080 | 容器資源監控 |
| MQTT TCP | 1884 | 1883 | Eclipse Mosquitto |
| MQTT WS | 9002 | 9001 | MQTT over WebSocket |

---

## 快速部署

### 前置條件

```bash
# 1. 確認 JetPack / L4T 版本
cat /etc/nv_tegra_release
# 預期：# R38 (release), REVISION: x.x

# 2. 確認 Docker
docker --version

# 3. 安裝 NVIDIA Container Toolkit（JetPack 7.x 通常已內建）
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# 4. 確認 GPU runtime
docker info | grep -i runtime

# 5. 設定最高效能模式（建議）
sudo nvpmodel -m 0     # MAXN 模式
sudo jetson_clocks     # 固定最高時脈
```

### 部署步驟

```bash
# 1. Clone 專案
git clone https://github.com/guessleej/xCloudVLMui-mic743.git
cd xCloudVLMui-mic743

# 2. 設定環境
make setup
# 編輯 backend/.env：填入 HF_TOKEN, SECRET_KEY
# 編輯 frontend/.env.local：填入 NEXTAUTH_SECRET, OAuth 憑證

# 3. 啟動所有服務（首次約 10-15 分鐘，需下載 ~4GB GGUF 模型）
make up

# 4. 追蹤模型下載進度
make logs-llm

# 5. 驗證服務健康
make test
```

### 訪問介面

| 介面 | URL |
|------|-----|
| 主要 Web UI | `http://<MIC743_IP>:8780` |
| API 文件 | `http://<MIC743_IP>:8780/docs` |
| LLaMA.cpp | `http://<MIC743_IP>:18180/health` |
| cAdvisor | `http://<MIC743_IP>:8191` |

---

## Blackwell GPU 推論設定

```yaml
# docker-compose.yml llama-cpp 關鍵參數
--n-gpu-layers 99    # 全部 Layer 上 GPU（128GB 足夠）
--flash-attn         # Blackwell Tensor Core Gen5 FlashAttention
--ctx-size 131072    # 128K context window
--threads 14         # Neoverse V3AE × 14 核全部使用
--mlock              # 鎖定 128GB unified memory，零 swap
```

### 效能參考

| 項目 | 數值 |
|------|------|
| AI 算力 | 2,070 FP4 TFLOPs |
| Context Window | 128K tokens |
| 模型載入時間 | ~15-30 秒（首次）|

---

## 模型配置

| 模型 | 量化 | 大小 | 用途 |
|------|------|------|------|
| Gemma 4 E4B Q4_K_M | GGUF | ~4GB | LLM 問答 + VLM 推論 |
| Gemma 4 E4B Q6_K | GGUF | ~6GB | 高精度選項 |
| YOLO11n detect (E2E) | ONNX | ~6MB | 設備巡檢 |
| YOLO11n pose (E2E) | ONNX | ~7MB | 人員辨識 |

---

## Jetson 效能監控

```bash
# 即時 GPU/CPU/記憶體監控
sudo tegrastats

# 查看效能模式
sudo nvpmodel -q

# 設定 MAXN 最高效能模式
sudo nvpmodel -m 0 && sudo jetson_clocks
```

---

## 故障排除

### NVIDIA Container Runtime 未配置
```bash
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### llama-cpp 映像找不到（Blackwell ARM64）
```yaml
# 若 CUDA 映像尚不支援 Jetson Thor，改用：
image: dustynv/llama.cpp:r38.1.0
```

---

## 多平台總覽

| 平台 | 倉庫 | Port | 架構 | 推論加速 |
|------|------|------|------|----------|
| DGX Spark | [xCloudVLMui-dgx-spark](https://github.com/guessleej/xCloudVLMui-dgx-spark) | :8780 | ARM64 | GB10 CUDA 13 / DGX OS 7.4 |
| **MIC-743** | **[xCloudVLMui-mic743](https://github.com/guessleej/xCloudVLMui-mic743)** | **:8780** | **ARM64** | **Blackwell CUDA 12.6 / JetPack 7.x** |
| AIR-030 | [xCloudVLMui-air030](https://github.com/guessleej/xCloudVLMui-air030) | :8780 | ARM64 | Ampere CUDA 11.4 / JetPack 5.1 |
| x86 | [xCloudVLMui-x86](https://github.com/guessleej/xCloudVLMui-x86) | :8680 | AMD64 | CPU / 可選 NVIDIA GPU |
| macOS | [xCloudVLMui-macOS](https://github.com/guessleej/xCloudVLMui-macOS) | :8880 | ARM64 | Ollama on Apple Silicon |

---

<div align="center">
由 <strong>云碩科技 xCloudinfo Corp.Limited</strong> 開發 · Powered by NVIDIA Jetson AGX Thor T5000 (Blackwell)
</div>
