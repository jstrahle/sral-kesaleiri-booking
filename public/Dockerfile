# --- Kaannosvaihe -----------------------------------------------------------
FROM docker.io/library/node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
# Lukkotiedostoa kaytetaan aina kun se on olemassa (suositus: commitoi se).
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

# --- Ajovaihe ---------------------------------------------------------------
FROM docker.io/library/node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY migrations ./migrations
COPY src/views ./dist/views
COPY src/static ./dist/static

USER node

EXPOSE 3000
CMD ["sh", "-c", "node dist/migrate.js && node dist/server.js"]
