###############################################################################
# Makefile — xCloudVLMui Platform [bot-mic743]
# Advantech MIC-743 · Jetson Orin NX · JetPack 7.1 · ARM64 · CUDA 12.6
#
# Port 配置（bot-mic743 專用）：
#   nginx    → http://localhost:8780  ← 主要入口
#   backend  → http://localhost:8101/api/health
#   llama-cpp→ http://localhost:18180/health
#   vlm-webui→ http://localhost:8190
#   cadvisor → http://localhost:8191
###############################################################################
.PHONY: all help setup check-gpu up down restart logs logs-llm logs-backend status test ps clean clean-all

COMPOSE      := docker compose
COMPOSE_FILE := -f docker-compose.yml

BLUE   := \033[0;34m
GREEN  := \033[0;32m
YELLOW := \033[1;33m
RED    := \033[0;31m
NC     := \033[0m

all: help

help:
	@echo ""
	@printf "$(BLUE)╔══════════════════════════════════════════════════════════╗$(NC)\n"
	@printf "$(BLUE)║  xCloudVLMui — MIC-743 · JetPack 7.1 · ARM64 · CUDA 12.6 ║$(NC)\n"
	@printf "$(BLUE)╠══════════════════════════════════════════════════════════╣$(NC)\n"
	@printf "$(BLUE)║  nginx:8780  backend:8101  frontend:3200  llama:18180     ║$(NC)\n"
	@printf "$(BLUE)╚══════════════════════════════════════════════════════════╝$(NC)\n"
	@echo ""
	@printf "$(YELLOW)首次部署：$(NC)\n"
	@printf "  make setup    複製 .env，確認 GPU runtime\n"
	@printf "  make up       建置並啟動所有服務\n"
	@printf "  make test     驗證服務健康狀態\n"
	@echo ""

setup:
	@if [ ! -f backend/.env ]; then cp backend/.env.example backend/.env; fi
	@if [ ! -f frontend/.env.local ]; then cp frontend/.env.local.example frontend/.env.local; fi
	@$(MAKE) check-gpu
	@printf "$(GREEN)✓ setup 完成！執行 make up$(NC)\n"

check-gpu:
	@command -v tegrastats >/dev/null 2>&1 && printf "$(GREEN)  ✓ JetPack 已安裝$(NC)\n" || printf "$(YELLOW)  ⚠ 確認 JetPack 7.1$(NC)\n"
	@docker info --format '{{.Runtimes}}' 2>/dev/null | grep -q nvidia \
		&& printf "$(GREEN)  ✓ NVIDIA Runtime 已配置$(NC)\n" \
		|| printf "$(RED)  ✗ 執行: sudo apt install nvidia-container-toolkit$(NC)\n"

up:
	@printf "$(BLUE)► 啟動 MIC-743 服務...$(NC)\n"
	$(COMPOSE) $(COMPOSE_FILE) up -d --build
	@printf "$(GREEN)✓ nginx:8780  backend:8101  frontend:3200$(NC)\n"

down:
	$(COMPOSE) $(COMPOSE_FILE) down

restart:
	$(COMPOSE) $(COMPOSE_FILE) restart

logs:
	$(COMPOSE) $(COMPOSE_FILE) logs -f --tail=100

logs-llm:
	$(COMPOSE) $(COMPOSE_FILE) logs -f --tail=100 llama-cpp

logs-backend:
	$(COMPOSE) $(COMPOSE_FILE) logs -f --tail=100 backend

status:
	$(COMPOSE) $(COMPOSE_FILE) ps

ps:
	$(COMPOSE) $(COMPOSE_FILE) ps

test:
	@for url in "http://localhost:8101/api/health" "http://localhost:18180/health" "http://localhost:8780/api/health"; do \
		CODE=$$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 $$url 2>/dev/null || echo "ERR"); \
		[ "$$CODE" = "200" ] && printf "  $(GREEN)✓$(NC) $$url\n" || printf "  $(RED)✗$(NC) $$url → $$CODE\n"; \
	done

clean:
	$(COMPOSE) $(COMPOSE_FILE) down --rmi local

clean-all:
	$(COMPOSE) $(COMPOSE_FILE) down -v --rmi local
