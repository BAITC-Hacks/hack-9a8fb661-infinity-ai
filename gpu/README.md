# LLM агента на NVIDIA GPU (Brev)

Необязательная часть: основной сценарий работает без GPU и без ключей (`USE_MOCK_LLM=true`).

1. Brev → Create Environment → H200 (или L40S 48 GB) × 1, VM Mode, имя `infinity-llm`.
   Скрипт сам выбирает модель: ≥80 GB видеопамяти — Qwen3.8-27B bf16, иначе FP8.
2. `brev login`, затем скопировать и запустить скрипт:
   ```bash
   scp gpu/serve_vllm.sh infinity-llm:~ && ssh infinity-llm 'bash ~/serve_vllm.sh'
   ```
3. Туннель к API модели: `brev port-forward infinity-llm -p 8001:8000`
4. В `.env`:
   ```
   USE_MOCK_LLM=false
   LLM_BASE_URL=http://localhost:8001/v1
   OPENAI_MODEL_FAST=qwen
   OPENAI_MODEL_STRONG=qwen
   ```
Модель: Qwen3.8-27B-FP8 (Apache 2.0) через vLLM — OpenAI-совместимый API с вызовом
инструментов (`qwen3_xml`), поэтому код агента не меняется. Режим размышлений отключается
на каждом запросе (`enable_thinking=false`) — агенту нужны быстрые ответы.
Параметры запуска — по официальному рецепту vLLM для Qwen3.8-27B. Остановить машину после демо: `brev stop infinity-llm`.
