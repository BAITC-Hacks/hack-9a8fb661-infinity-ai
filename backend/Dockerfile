# Сборка из корня репозитория: docker build -f backend/Dockerfile .
FROM python:3.12-slim
WORKDIR /srv/backend
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app app
COPY data/raw /srv/data/raw
COPY data/cache /srv/data/cache
ENV DATA_DIR=/srv/data OUTPUT_DIR=/srv/outputs
EXPOSE 8000
HEALTHCHECK --interval=5s --timeout=3s --retries=30 CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["sh", "-c", "python -m app.cli ensure && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
