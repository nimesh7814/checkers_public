FROM public.ecr.aws/docker/library/node:20-alpine AS builder
WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json bun.lockb* package-lock.json* ./
RUN npm install

# Copy source and build
COPY . .
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Production image: serve static build and proxy API/WebSocket to backend
FROM public.ecr.aws/docker/library/node:20-alpine
WORKDIR /app
RUN npm install express http-proxy-middleware
COPY --from=builder /app/dist ./dist
COPY frontend-server.js ./frontend-server.js
EXPOSE 80
CMD ["node", "frontend-server.js"]
