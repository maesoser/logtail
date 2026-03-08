# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Build backend
FROM golang:1.22-alpine AS backend
WORKDIR /app
# Install build dependencies
RUN apk add --no-cache git
# Copy go mod files first for better caching
COPY go.mod go.sum ./
RUN go mod download
# Copy source code
COPY . .
# Copy built frontend assets
COPY --from=frontend /app/web/dist ./web/dist
# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o webtail ./cmd/webtail

# Stage 3: Runtime
FROM alpine:3.20
# Add ca-certificates for HTTPS support and tzdata for timezone
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
# Copy the binary
COPY --from=backend /app/webtail /usr/local/bin/webtail
# Create non-root user
RUN adduser -D -g '' webtail
USER webtail
# Expose port
EXPOSE 8080
# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1
# Run
ENTRYPOINT ["webtail"]
CMD ["-port", "8080", "-buffer-size", "10000"]
