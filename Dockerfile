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

COPY backend/package.json ./package.json
RUN npm install --omit=dev

COPY --from=back-builder /app/backend/dist ./dist
COPY --from=front-builder /app/front/dist ./public
COPY backend/data ./data

EXPOSE 8080
CMD ["node", "dist/index.js"]
