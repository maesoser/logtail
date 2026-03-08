package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	webtail "github.com/webtail/webtail"
	"github.com/webtail/webtail/internal/api"
	"github.com/webtail/webtail/internal/buffer"
	"github.com/webtail/webtail/internal/config"
	"github.com/webtail/webtail/internal/models"
	"github.com/webtail/webtail/internal/websocket"
)

func main() {
	// Parse configuration
	cfg := config.ParseFlags()

	if err := cfg.Validate(); err != nil {
		log.Fatalf("Configuration error: %v", err)
	}

	log.Printf("Starting webtail with configuration: %s", cfg)

	// Initialize circular buffer
	buf := buffer.New(cfg.BufferSizeBytes())
	log.Printf("Initialized circular buffer with max size: %d MB", cfg.BufferSizeMB)

	// Initialize WebSocket hub
	hub := websocket.NewHub()
	go hub.Run()
	log.Printf("WebSocket hub started")

	// Initialize settings store
	// Settings are persisted to a file in the user's config directory
	settingsPath := ""
	if configDir, err := os.UserConfigDir(); err == nil {
		settingsDir := filepath.Join(configDir, "logtail")
		if err := os.MkdirAll(settingsDir, 0755); err == nil {
			settingsPath = filepath.Join(settingsDir, "settings.json")
		}
	}
	settings := models.NewSettingsStore(settingsPath, cfg.IngestToken)
	if settingsPath != "" {
		log.Printf("Settings stored at: %s", settingsPath)
	}

	// Create router
	router := api.NewRouter(buf, hub, webtail.WebAssets, cfg.DevMode, settings)

	// Create HTTP server
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Printf("Server listening on http://localhost:%d", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown error: %v", err)
	}

	log.Println("Server stopped")
}
