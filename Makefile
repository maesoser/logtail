# Logtail Makefile
# Build targets for macos-arm64 and linux-arm64

BINARY_NAME := logtail
BUILD_DIR := build
CMD_PATH := ./cmd/logtail
WEB_DIR := web

# Version info (override with: make VERSION=1.2.3)
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME := $(shell date -u '+%Y-%m-%dT%H:%M:%SZ')
LDFLAGS := -ldflags="-s -w -X main.version=$(VERSION) -X main.buildTime=$(BUILD_TIME)"

# Default target
.PHONY: all
all: build

# Build for current platform
.PHONY: build
build: frontend
	go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) $(CMD_PATH)

# Build for all target platforms
.PHONY: build-all
build-all: build-macos-arm64 build-linux-armv5

# macOS ARM64 (Apple Silicon)
.PHONY: build-macos-arm64
build-macos-arm64: frontend
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-arm64 $(CMD_PATH)

# Linux ARMv5 (older ARM devices, Raspberry Pi 1, etc.)
.PHONY: build-linux-armv5
build-linux-armv5: frontend
	GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-armv5 $(CMD_PATH)

# Build frontend assets
.PHONY: frontend
frontend: $(WEB_DIR)/dist

$(WEB_DIR)/dist: $(WEB_DIR)/package.json $(WEB_DIR)/src/**/*
	cd $(WEB_DIR) && npm install && npm run build
	@touch $(WEB_DIR)/dist

# Development
.PHONY: dev
dev:
	go run $(CMD_PATH) -dev

.PHONY: dev-frontend
dev-frontend:
	cd $(WEB_DIR) && npm run dev

# Testing
.PHONY: test
test:
	go test -v -race ./...

.PHONY: test-short
test-short:
	go test -short ./...

# Linting
.PHONY: lint
lint:
	go vet ./...
	cd $(WEB_DIR) && npm run lint

.PHONY: typecheck
typecheck:
	cd $(WEB_DIR) && npx tsc --noEmit

# Clean build artifacts
.PHONY: clean
clean:
	rm -rf $(BUILD_DIR)
	rm -rf $(WEB_DIR)/dist
	rm -rf $(WEB_DIR)/node_modules

# Clean only build output (keep node_modules)
.PHONY: clean-build
clean-build:
	rm -rf $(BUILD_DIR)
	rm -rf $(WEB_DIR)/dist

# Create build directory
$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

# Help
.PHONY: help
help:
	@echo "Logtail Build Targets:"
	@echo ""
	@echo "  make              - Build for current platform"
	@echo "  make build-all    - Build for all target platforms"
	@echo "  make build-macos-arm64   - Build for macOS ARM64"
	@echo "  make build-linux-armv5   - Build for Linux ARMv5"
	@echo ""
	@echo "  make frontend     - Build frontend assets only"
	@echo "  make dev          - Run backend in dev mode"
	@echo "  make dev-frontend - Run frontend dev server"
	@echo ""
	@echo "  make test         - Run all tests with race detection"
	@echo "  make lint         - Run linters"
	@echo "  make typecheck    - TypeScript type check"
	@echo ""
	@echo "  make clean        - Remove all build artifacts"
	@echo "  make clean-build  - Remove builds (keep node_modules)"
	@echo ""
	@echo "Variables:"
	@echo "  VERSION=$(VERSION)"
