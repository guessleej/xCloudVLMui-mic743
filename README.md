# xCloudVLMui — MIC-743 JetPack 7.1 部署指南

> **目標平台**：Advantech MIC-743  
> **SoM**：NVIDIA Jetson Orin NX 16GB  
> **OS**：NVIDIA JetPack 7.1 (L4T R38.x)  
> **架構**：ARM64 (aarch64)  
> **加速**：CUDA 12.6 · TensorRT 10.x · cuDNN 9.x  

---

## 硬體規格

| 項目 | 規格 |
|------|------|
| 硬體平台 | Advantech MIC-743 Industrial AI Box |
| SoM | Jetson Orin NX 16GB |
| CPU | 8-core Arm Cortex-A78AE |
| GPU | 1024-core Ampere + 32 Tensor Cores |
| 記憶體 | 16GB LPDDR5 unified memory |
| 作業系統 | Ubuntu 22.04 (L4T R38.x) |
| CUDA | 12.6 |
| JetPack | 7.1 |

## 服務 Port 配置

| 服務 | 外部 Port | 說明 |
|------|-----------|------|
| nginx (主要入口) | **8780** | 反向代理 |
| backend API | 8101 | FastAPI |
| frontend | 3200 | Next.js 儀表板 |
| llama-cpp | 18180 | Gemma 4 E4B CUDA 推論 |
| vlm-webui | 8190 | WebRTC 視覺串流 |
| cadvisor | 8191 | 容器資源監控 |
| MQTT | 1884 / 9002 | Eclipse Mosquitto |

## 快速部署

```bash
# Clone 專案
git clone https://github.com/guessleej/xCloudVLMui-mic743.git
cd xCloudVLMui-mic743

# 設定環境
make setup
# 編輯 backend/.env 填入 HF_TOKEN、SECRET_KEY
# 編輯 frontend/.env.local 填入 OAuth 憑證

# 啟動（首次約 10 分鐘，需下載模型）
make up

# 驗證健康
make test
```

## 模型配置

MIC-743 (Orin NX 16GB) 使用較小量化降低記憶體壓力：

| 模型 | 量化 | 大小 | 推論引擎 |
|------|------|------|----------|
| Gemma 4 E4B Q3_K_S | GGUF | ~3GB | llama.cpp CUDA |
| YOLO26n detect | E2E ONNX | ~6MB | WASM 前端 |

> 若記憶體充裕可改用 Q4_K_M：`MODEL_FILE=gemma-4-e4b-it-Q4_K_M.gguf`

## JetPack 7.1 前置設定

```bash
# 確認版本
cat /etc/nv_tegra_release
# 預期：R38 (release)

# 安裝 NVIDIA Container Toolkit
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker

# 設定最高效能模式
sudo nvpmodel -m 0
sudo jetson_clocks
```

## GitHub 倉庫

此倉庫專用於 MIC-743 平台部署：  
**`https://github.com/guessleej/xCloudVLMui-mic743`**

---

## 四平台總覽

| 平台 | 倉庫 | Port | 加速 |
|------|------|------|------|
| macOS | xCloudVLMui | :3110 | CPU / Apple Silicon |
| AIR-030 | xCloudVLMui-air030 | :8880 | CUDA 12.2 / JetPack 6.0 |
| **MIC-743** | **xCloudVLMui-mic743** | **:8780** | **CUDA 12.6 / JetPack 7.1** |
| x86 | xCloudVLMui-x86 | :8680 | CPU / 可選 NVIDIA GPU |
