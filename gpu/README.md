# LLM агента на NVIDIA GPU (Brev)

Необязательная часть: основной сценарий работает без GPU и без ключей (`USE_MOCK_LLM=true`).

1. Brev → Create Environment → L40S 48 GB × 1, VM Mode, имя `infinity-llm`.
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
Модель: Qwen2.5-14B-Instruct (Apache 2.0) через vLLM — OpenAI-совместимый API с вызовом
инструментов, поэтому код агента не меняется. Остановить машину после демо: `brev stop infinity-llm`.
