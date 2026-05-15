FROM node:22-alpine

WORKDIR /app

COPY agent/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
RUN npm install tsx typescript --save-dev

COPY agent/ .

ENV NODE_ENV=production

CMD ["npx", "tsx", "src/index.ts"]
