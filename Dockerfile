FROM node:20-alpine

# FFmpeg for video processing
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
COPY turbo.json ./
COPY apps/web/package*.json ./apps/web/
COPY apps/worker/package*.json ./apps/worker/
COPY packages/db/package*.json ./packages/db/
COPY packages/queue/package*.json ./packages/queue/
COPY packages/types/package*.json ./packages/types/
COPY packages/config/package*.json ./packages/config/

RUN npm ci

COPY . .

RUN npx turbo build

EXPOSE 3000

CMD ["npm", "run", "start"]
