# Image de base figée par digest (node 22.23.4, Alpine 3.24.4) : même base à chaque build.
# Pour la mettre à jour : docker pull node:22-alpine puis reporter le nouveau digest ici.
ARG NODE_IMAGE=node:22-alpine@sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202

# Étape 1 : Construction
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Étape 2 : Migrations Prisma (image distincte, construite avec --target migrator)
# Le CLI Prisma est une devDependency : il n'est pas embarqué dans l'image de l'API.
# Cette image, publiée avec le même tag que l'API, applique "prisma migrate deploy" avant le démarrage.
FROM ${NODE_IMAGE} AS migrator

ARG VERSION=dev
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="souverainrecrut-backend-migrate" \
      org.opencontainers.image.description="Migrations Prisma SouverainRecrut" \
      org.opencontainers.image.source="https://github.com/EAnathos/souverainrecrut" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"

WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# Dépendances de production + CLI Prisma à la version figée par package-lock.json, puis retrait de npm
RUN npm ci --omit=dev \
 && npm install --no-save --no-audit --no-fund \
      "prisma@$(node -p "require('./package-lock.json').packages['node_modules/prisma'].version")" \
 && npm cache clean --force \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY prisma.config.ts ./
COPY prisma ./prisma

USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

# Étape 3 : Production (cible par défaut, doit rester la dernière)
FROM ${NODE_IMAGE} AS runner

ARG VERSION=dev
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="souverainrecrut-backend" \
      org.opencontainers.image.description="API REST SouverainRecrut" \
      org.opencontainers.image.source="https://github.com/EAnathos/souverainrecrut" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"

WORKDIR /app
# Le code écoute sur 4500 par défaut : on aligne l'image sur le port exposé (4000)
ENV NODE_ENV=production \
    PORT=4000

COPY package*.json ./
# npm ne sert plus à l'exécution : on le retire pour réduire la surface d'attaque (scan Trivy)
RUN npm ci --omit=dev \
 && npm cache clean --force \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Copie des fichiers nécessaires depuis le builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Utilisateur non privilégié fourni par l'image node
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/v1/health || exit 1
CMD ["node", "dist/server.js"]
