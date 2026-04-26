###############################################################################
# Makefile — xCloudVLMui Platform [bot-mic743]
#
# 硬體：Advantech NVIDIA DGX
# SoM ：NVIDIA DGX
# GPU ：Blackwell 2,560 CUDA Cores + 96 Tensor Cores (Gen5) — 2,070 FP4 TFLOPs
# RAM ：128 GB LPDDR5X Unified Memory
# CPU ：x86_64
#
# ┌─ 首次部署 ──────────────────────────────────────────────────────────┐
# │  make setup        # 複製 .env，確認 NVIDIA runtime                 │
# │  make up           # 建置並啟動（首次自動下載模型 ~4GB）            │
# │  make test         # 驗證所有服務健康狀態                           │
# └────────────────────────────────────────────────────────────────────┘
#
# Port 配置（bot-mic743 專用）：
#   nginx    → http://localhost:8780  ← 主要入口
#   backend  → http://localhost:8101/api/health
#   llama-cpp→ http://localhost:18180/health
#   vlm-webui→ http://localhost:8190
#   cadvisor → http://localhost:8191
###############################################################################

.PHONY: all help setup check-gpu up down restart \
        logs logs-llm logs-backend logs-frontend logs-mqtt \
        status test ps shell-backend shell-frontend clean clean-all gpu-info

COMPOSE      := docker compose
COMPOSE_FILE := -f docker-compose.yml

BLUE   := \033[0;34m
GREEN  := \033[0;32m
YELLOW := \033[1;33m
RED    := \033[0;31m
CYAN   := \033[0;36m
NC     := \033[0m

all: help

help:
	@echo ""
	@printf "$(BLUE)╔══════════════════════════════════════════════════════════════════╗$(NC)\n"
	@printf "$(BLUE)║  xCloudVLMui — DGX · NVIDIA DGX · Blackwell · 512GB    ║$(NC)\n"
	@printf "$(BLUE)╠══════════════════════════════════════════════════════════════════╣$(NC)\n"
	@printf "$(BLUE)║  GPU: 2,560 CUDA Cores (Blackwell) · 2,070 FP4 TFLOPs           ║$(NC)\n"
	@printf "$(BLUE)╠══════════════════════════════════════════════════════════════════╣$(NC)\n"
	@printf "$(BLUE)║  nginx:8780  backend:8101  frontend:3200  llama:18180            ║$(NC)\n"
	@printf "$(BLUE)╚══════════════════════════════════════════════════════════════════╝$(NC)\n"
	@echo ""
	@printf "$(YELLOW)首次部署：$(NC)\n"
	@printf "  make setup          複製 .env 並確認 NVIDIA Blackwell runtime\n"
	@printf "  make up             建置並啟動所有服務（含 Blackwell CUDA 推論）\n"
	@printf "  make test           驗證所有服務健康狀態\n"
	@echo ""
	@printf "$(YELLOW)日常操作：$(NC)\n"
	@printf "  make logs           查看所有服務 log\n"
	@printf "  make logs-llm       查看 llama-cpp GPU 推論 log\n"
	@printf "  make gpu-info       顯示 Jetson Thor GPU 狀態與效能\n"
	@printf "  make status         顯示容器狀態\n"
	@printf "  make restart        重啟所有服務\n"
	@printf "  make down           停止容器\n"
	@printf "  make clean          停止並移除容器（保留資料）\n"
	@printf "  make clean-all      完全清除（含 Volume 資料庫與模型）\n"
	@echo ""

# ─────────────────────────────────────────────────────────────────────
# 首次設定
# ─────────────────────────────────────────────────────────────────────

setup: check-gpu env-copy
	@printf "$(GREEN)✓ DGX setup 完成！執行 make up 啟動服務。$(NC)\n"

env-copy:
	@printf "$(BLUE)► 設定環境變數...$(NC)\n"
	@if [ ! -f backend/.env ]; then \
		cp backend/.env.example backend/.env ; \
		printf "$(YELLOW)  ⚠ 已複製 backend/.env — 請填入 HF_TOKEN 與 SECRET_KEY。$(NC)\n" ; \
	else \
		printf "$(GREEN)  ✓ backend/.env 已存在。$(NC)\n" ; \
	fi
	@if [ ! -f frontend/.env.local ]; then \
		cp frontend/.env.local.example frontend/.env.local ; \
		printf "$(YELLOW)  ⚠ 已複製 frontend/.env.local — 請填入 NEXTAUTH_SECRET 與 OAuth 憑證。$(NC)\n" ; \
	else \
		printf "$(GREEN)  ✓ frontend/.env.local 已存在。$(NC)\n" ; \
	fi

check-gpu:
	@printf "$(BLUE)► 確認 Jetson Thor GPU 環境...$(NC)\n"
	@if command -v tegrastats > /dev/null 2>&1; then \
		printf "$(GREEN)  ✓ tegrastats 可用（JetPack 已安裝）$(NC)\n" ; \
	else \
		printf "$(YELLOW)  ⚠ tegrastats 未找到，請確認 JetPack 安裝狀態$(NC)\n" ; \
	fi
	@if docker info --format '{{.Runtimes}}' 2>/dev/null | grep -q nvidia; then \
		printf "$(GREEN)  ✓ NVIDIA Container Runtime 已配置$(NC)\n" ; \
	else \
		printf "$(RED)  ✗ NVIDIA Container Runtime 未配置！$(NC)\n" ; \
		printf "$(YELLOW)    請執行：$(NC)\n" ; \
		printf "    sudo apt-get install -y nvidia-container-toolkit\n" ; \
		printf "    sudo nvidia-ctk runtime configure --runtime=docker\n" ; \
		printf "    sudo systemctl restart docker\n" ; \
	fi

gpu-info:
	@printf "$(CYAN)══ NVIDIA DGX 效能狀態 ══$(NC)\n"
	@printf "$(BLUE)── GPU 資訊 ─────────────────────────────────────$(NC)\n"
	@nvidia-smi 2>/dev/null || printf "$(YELLOW)  (Jetson 使用 tegrastats 取代 nvidia-smi)$(NC)\n"
	@printf "$(BLUE)── Tegrastats 快照（3 秒）────────────────────────$(NC)\n"
	@timeout 3 tegrastats 2>/dev/null | head -2 || printf "$(YELLOW)  tegrastats 不可用$(NC)\n"
	@printf "$(BLUE)── 目前效能模式 ──────────────────────────────────$(NC)\n"
	@sudo nvpmodel -q 2>/dev/null || printf "  (需要 sudo)\n"
	@printf "$(BLUE)── 容器 GPU 使用狀況 ─────────────────────────────$(NC)\n"
	@$(COMPOSE) $(COMPOSE_FILE) exec llama-cpp nvidia-smi 2>/dev/null || \
		printf "  (llama-cpp 容器未運行)\n"

# ─────────────────────────────────────────────────────────────────────
# Docker 操作
# ─────────────────────────────────────────────────────────────────────

build:
	@printf "$(BLUE)► 建置 DGX 映像（arm64）...$(NC)\n"
	$(COMPOSE) $(COMPOSE_FILE) build --parallel

up:
	@printf "$(BLUE)► 啟動 DGX 服務（Blackwell 2,070 TFLOPs CUDA 加速）...$(NC)\n"
	$(COMPOSE) $(COMPOSE_FILE) up -d --build
	@echo ""
	@printf "$(GREEN)✓ 服務已啟動！$(NC)\n\n"
	@printf "  主要入口  → $(BLUE)http://localhost:8780$(NC)\n"
	@printf "  API Docs  → $(BLUE)http://localhost:8780/docs$(NC)\n"
	@printf "  Backend   → $(BLUE)http://localhost:8101/api/health$(NC)\n"
	@printf "  Frontend  → $(BLUE)http://localhost:3200$(NC)\n"
	@printf "  LLaMA.cpp → $(BLUE)http://localhost:18180/health$(NC)  ← Blackwell GPU\n"
	@printf "  VLM WebUI → $(BLUE)http://localhost:8190$(NC)\n"
	@printf "  cAdvisor  → $(BLUE)http://localhost:8191$(NC)\n"
	@printf "  MQTT      → $(BLUE)mqtt://localhost:1884$(NC)\n"
	@echo ""
	@printf "$(CYAN)  ℹ 首次啟動需下載 GGUF 模型（~4GB），請稍候...$(NC)\n"
	@printf "$(CYAN)    追蹤進度：make logs-llm$(NC)\n"

down:
	$(COMPOSE) $(COMPOSE_FILE) down

restart:
	$(COMPOSE) $(COMPOSE_FILE) restart

restart-backend:
	$(COMPOSE) $(COMPOSE_FILE) restart backend

restart-llm:
	@printf "$(BLUE)► 重啟 llama-cpp（Blackwell GPU 推論引擎）...$(NC)\n"
	$(COMPOSE) $(COMPOSE_FILE) restart llama-cpp

# ─────────────────────────────────────────────────────────────────────
# 監控
# ─────────────────────────────────────────────────────────────────────

logs:
	$(COMPOSE) $(COMPOSE_FILE) logs -f --tail=100

logs-llm:
	$(COMPOSE) $(COMPOSE_FILE) logs -f --tail=100 llama-cpp

logs-backend:
	$(COMPOSE) $(COMPOSE_FILE) logs -f --tail=100 backend

logs-frontend:
	$(COMPOSE) $(COMPOSE_FILE) logs -f --tail=100 frontend

logs-mqtt:
	$(COMPOSE) $(COMPOSE_FILE) logs -f --tail=100 mosquitto

ps:
	$(COMPOSE) $(COMPOSE_FILE) ps

status:
	@printf "$(BLUE)── DGX (NVIDIA DGX) 容器狀態 ──$(NC)\n"
	$(COMPOSE) $(COMPOSE_FILE) ps

# ─────────────────────────────────────────────────────────────────────
# 健康狀態驗證
# ─────────────────────────────────────────────────────────────────────

test:
	@printf "$(BLUE)► 驗證 DGX 服務健康狀態...$(NC)\n"
	@PASS=0 ; FAIL=0 ; \
	for url in \
		"http://localhost:8101/api/health" \
		"http://localhost:18180/health" \
		"http://localhost:8780/api/health" \
		"http://localhost:8191/healthz" ; do \
		CODE=$$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 $$url 2>/dev/null || echo "ERR") ; \
		if [ "$$CODE" = "200" ]; then \
			printf "  $(GREEN)✓$(NC) %-52s → %s\n" "$$url" "$$CODE" ; \
			PASS=$$((PASS+1)) ; \
		else \
			printf "  $(RED)✗$(NC) %-52s → %s\n" "$$url" "$$CODE" ; \
			FAIL=$$((FAIL+1)) ; \
		fi ; \
	done ; \
	echo "" ; \
	printf "  $(GREEN)通過: $$PASS$(NC) / $(RED)失敗: $$FAIL$(NC)\n"

# ─────────────────────────────────────────────────────────────────────
# Shell 進入
# ─────────────────────────────────────────────────────────────────────

shell-backend:
	$(COMPOSE) $(COMPOSE_FILE) exec backend /bin/bash

shell-frontend:
	$(COMPOSE) $(COMPOSE_FILE) exec frontend /bin/sh

shell-llm:
	$(COMPOSE) $(COMPOSE_FILE) exec llama-cpp /bin/bash

# ─────────────────────────────────────────────────────────────────────
# 清理
# ─────────────────────────────────────────────────────────────────────

clean:
	$(COMPOSE) $(COMPOSE_FILE) down --rmi local
	@printf "$(GREEN)✓ 容器已清除（資料 Volume 保留）。$(NC)\n"

clean-all:
	@printf "$(RED)⚠ 這將刪除 DGX 所有資料，包含 GGUF 模型（~4GB）！$(NC)\n"
	@printf "$(YELLOW)確認？(y/N) $(NC)" ; read confirm ; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		$(COMPOSE) $(COMPOSE_FILE) down -v --rmi local ; \
		printf "$(GREEN)✓ 完全清除完成。$(NC)\n" ; \
	else \
		printf "已取消。\n" ; \
	fi
