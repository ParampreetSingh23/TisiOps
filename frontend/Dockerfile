# Build from repo root: the frontend imports @tisiops/server source.
FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY server/package.json server/
RUN npm ci

COPY server server
COPY frontend frontend

# NEXT_PUBLIC_* values are inlined at build time. The env file is mounted
# for this step only, so no secret lands in an image layer.
RUN --mount=type=secret,id=web_env,target=/app/frontend/.env.local \
    npm run build -w frontend

EXPOSE 3000
CMD ["npm", "run", "start", "-w", "frontend"]
