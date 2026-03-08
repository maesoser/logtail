package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
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
	// Parse CLI flags (only config file path and dev mode)
	cliCfg := config.ParseFlags()

	log.Printf("Starting logtail with CLI config: %s", cliCfg)

	// Ensure config directory exists
	if cliCfg.ConfigFile != "" {
		if err := config.EnsureConfigDir(cliCfg.ConfigFile); err != nil {
			log.Printf("Warning: could not create config directory: %v", err)
		}
	}

	// Load configuration from YAML file
	configStore := models.NewConfigStore(cliCfg.ConfigFile)
	cfg := configStore.Get()

	// Validate configuration
	if err := cfg.Validate(); err != nil {
		log.Fatalf("Configuration error: %v", err)
	}

	log.Printf("Loaded configuration from: %s", cliCfg.ConfigFile)
	log.Printf("Server port: %d, Buffer size: %d MB", cfg.Server.Port, cfg.Buffer.SizeMB)

	// Initialize circular buffer
	buf := buffer.New(cfg.BufferSizeBytes())
	log.Printf("Initialized circular buffer with max size: %d MB", cfg.Buffer.SizeMB)

	// Initialize WebSocket hub
	hub := websocket.NewHub()
	go hub.Run()
	log.Printf("WebSocket hub started")

	// Create router
	router := api.NewRouter(buf, hub, webtail.WebAssets, cliCfg.DevMode, configStore)

	// Create HTTP server
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Printf("Server listening on http://localhost:%d", cfg.Server.Port)
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
