# ── Stage 1 : build React ──────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2 : Flask app ────────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Copie le build React dans le dossier static servi par Flask
COPY --from=frontend-builder /frontend/dist ./static

RUN mkdir -p /app/data

ENV DATA_DIR=/app/data
ENV SECRET_KEY=changeme-set-in-compose

EXPOSE 5003

CMD ["gunicorn", "--bind", "0.0.0.0:5003", "--workers", "2", "--timeout", "60", "app:app"]
