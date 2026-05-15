FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Install tsx for running TypeScript directly
RUN npm install tsx typescript --save-dev

COPY . .

ENV NODE_ENV=production

CMD ["npx", "tsx", "src/index.ts"]
