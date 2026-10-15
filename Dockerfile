# Build and run OpenForce CRM
FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application code
COPY src/ ./src/
COPY public/ ./public/

ENV PORT=3000
ENV NODE_ENV=production
ENV AUTO_SEED=false

EXPOSE 3000

CMD ["node", "src/server.js"]
