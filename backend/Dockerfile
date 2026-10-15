FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN npm rebuild better-sqlite3
EXPOSE 3000
CMD ["node", "src/index.js"]
