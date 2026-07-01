# Single image: NestJS API (/api) + the front-end apps (/) — one public URL.
FROM node:20-alpine AS build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate && npx nest build

FROM node:20-alpine
WORKDIR /app/backend
ENV NODE_ENV=production
ENV STATIC_DIR=/app/apps
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/backend/dist ./dist
COPY apps /app/apps
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
