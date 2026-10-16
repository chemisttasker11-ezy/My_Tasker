# Dedicated, same-origin app. Never import ChemistTasker application code.
FROM node:22-alpine AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY public ./public
COPY src ./src
COPY index.html tsconfig*.json vite.config.ts ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY server/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt \
    && addgroup --system app && adduser --system --ingroup app app
COPY server/ /app/server/
COPY --from=frontend /build/dist /app/dist/
ENV PYTHONPATH=/app/server DJANGO_SETTINGS_MODULE=my_tasker_server.settings
RUN mkdir -p /app/server/staticfiles && chown -R app:app /app
USER app
EXPOSE 8000
CMD ["gunicorn","--bind","0.0.0.0:8000","--workers","2","--threads","4","--access-logfile","-","--error-logfile","-","my_tasker_server.wsgi:application"]
