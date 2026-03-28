FROM node:22-alpine AS front-builder
WORKDIR /app/front
COPY front/package.json ./
RUN npm install
COPY front ./
RUN npm run build

FROM node:22-alpine AS back-builder
WORKDIR /app/backend
COPY backend/package.json ./
RUN npm install
COPY backend ./
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV APP_RUNTIME_DIR=/app/data/runtime
ENV APP_SQLITE_PATH=/app/data/runtime/turtle-soup.db
ENV AI_DEBUG_LOGS=false
ENV AI_DEBUG_LOG_MAX_CHARS=12000
ENV NODE_OPTIONS=--disable-warning=ExperimentalWarning

COPY backend/package.json ./package.json
RUN npm install --omit=dev

COPY --from=back-builder /app/backend/dist ./dist
COPY --from=front-builder /app/front/dist ./public
COPY backend/data ./data
RUN mkdir -p /app/data/runtime

EXPOSE 8080
CMD ["node", "dist/index.js"]
