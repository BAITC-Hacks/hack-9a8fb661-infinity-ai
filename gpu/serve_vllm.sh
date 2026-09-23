#!/usr/bin/env bash
# Запуск open-weight LLM на GPU (NVIDIA Brev, L40S 48 GB) с OpenAI-совместимым API.
# На машине Brev:  bash serve_vllm.sh      Локально:  brev port-forward infinity-llm -p 8001:8000
set -euo pipefail
MODEL="${MODEL:-Qwen/Qwen2.5-14B-Instruct}"   # bf16 ~30 GB, влезает в L40S; русский + tool calling
PORT="${PORT:-8000}"

python3 -m pip install -q --upgrade pip
python3 -m pip install -q vllm

nohup python3 -m vllm.entrypoints.openai.api_server \
  --model "$MODEL" --served-model-name qwen \
  --max-model-len 16384 --gpu-memory-utilization 0.90 \
  --enable-auto-tool-choice --tool-call-parser hermes \
  --host 0.0.0.0 --port "$PORT" > "$HOME/vllm.log" 2>&1 &

echo "vLLM стартует (загрузка модели ~5 мин). Лог: tail -f ~/vllm.log"
until curl -sf "http://127.0.0.1:$PORT/v1/models" > /dev/null; do sleep 5; done
echo "Готово: http://127.0.0.1:$PORT/v1 (model=qwen)"
