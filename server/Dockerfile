# Build from repo root: npm workspaces share one lockfile.
FROM node:24-slim

# Deployments shell out to `terraform`.
COPY --from=hashicorp/terraform:1.9 /bin/terraform /usr/local/bin/terraform

WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY server/package.json server/
RUN npm ci --workspace @tisiops/server

COPY server server
RUN cd server && npx prisma generate

EXPOSE 5001
CMD ["npm", "run", "start", "-w", "@tisiops/server"]
