#!/usr/bin/env bash
# Запуск open-weight LLM на GPU (NVIDIA Brev) в официальном контейнере vLLM,
# OpenAI-совместимый API на порту 8000.
# На машине Brev:  bash serve_vllm.sh      Локально:  brev port-forward infinity-llm -p 8001:8000
set -euo pipefail
PORT="${PORT:-8000}"

# Модель по объёму видеопамяти: >=80 GB (H100/H200) — полная bf16 (~55 GB),
# иначе FP8 (~28 GB, L40S 48 GB).
VRAM_GB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1 | awk '{print int($1/1024)}')
if [ "${VRAM_GB:-0}" -ge 80 ]; then DEFAULT_MODEL="Qwen/Qwen3.8-27B"; else DEFAULT_MODEL="Qwen/Qwen3.8-27B-FP8"; fi
MODEL="${MODEL:-$DEFAULT_MODEL}"
echo "GPU: ${VRAM_GB} GB -> $MODEL"

sudo systemctl start docker 2>/dev/null || true
docker rm -f vllm 2>/dev/null || true
docker run -d --name vllm --gpus all --ipc=host -p "$PORT:8000" \
  -v "$HOME/.cache/huggingface:/root/.cache/huggingface" \
  vllm/vllm-openai:latest \
  --model "$MODEL" --served-model-name qwen \
  --language-model-only --max-model-len 32768 --gpu-memory-utilization 0.90 \
  --reasoning-parser qwen3 \
  --enable-auto-tool-choice --tool-call-parser qwen3_xml

echo "vLLM стартует (загрузка образа и модели ~10 мин). Лог: docker logs -f vllm"
until curl -sf "http://127.0.0.1:$PORT/v1/models" > /dev/null; do
  docker ps -q -f name=vllm | grep -q . || { docker logs --tail 50 vllm; exit 1; }
  sleep 10
done
echo "Готово: http://127.0.0.1:$PORT/v1 (model=qwen)"
