FROM node:22-alpine AS builder
# better-sqlite3 在没有匹配预编译包时需要从源码构建
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN npm rebuild better-sqlite3
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "src/index.js"]
