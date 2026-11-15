# Builds Stockphony as one container: the frontend is compiled to static
# files, and the backend serves them alongside the API. Render builds this
# automatically on every push (see render.yaml).

# ---- 1. Build the frontend ----
FROM node:22-slim AS frontend
WORKDIR /app/frontend
# pnpm pinned to the version that matches pnpm-lock.yaml's format.
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
# Dependencies first, so Docker can reuse this step when only code changes.
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# ---- 2. The backend, serving the built frontend ----
FROM python:3.12-slim
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
# The backend looks for the frontend at ../frontend/dist (see FRONTEND_DIST).
COPY --from=frontend /app/frontend/dist /app/frontend/dist
# Print logs straight away rather than buffering them.
ENV PYTHONUNBUFFERED=1
# Render tells the app which port to use through $PORT.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
