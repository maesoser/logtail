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

	logtail "github.com/logtail/logtail"
	"github.com/logtail/logtail/internal/api"
	"github.com/logtail/logtail/internal/buffer"
	"github.com/logtail/logtail/internal/config"
	"github.com/logtail/logtail/internal/models"
	"github.com/logtail/logtail/internal/websocket"
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

	// Restore buffer from persistence file if configured
	if cfg.Buffer.PersistPath != "" {
		if err := buf.Load(cfg.Buffer.PersistPath); err != nil {
			log.Printf("No previous buffer state found or failed to load: %v", err)
		} else {
			log.Printf("Restored %d entries from %s", buf.Count(), cfg.Buffer.PersistPath)
		}
	}

	// Initialize WebSocket hub
	hub := websocket.NewHub()
	go hub.Run()
	log.Printf("WebSocket hub started")

	// Create router
	router := api.NewRouter(buf, hub, logtail.WebAssets, cliCfg.DevMode, configStore)

	// Create HTTP server
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Start auto-save goroutine if configured
	autoSaveStop := make(chan struct{})
	if cfg.Buffer.PersistPath != "" && cfg.Buffer.AutoSaveMinutes > 0 {
		go startAutoSave(buf, cfg.Buffer.PersistPath, cfg.Buffer.AutoSaveMinutes, autoSaveStop)
		log.Printf("Auto-save enabled: saving every %d minutes to %s", cfg.Buffer.AutoSaveMinutes, cfg.Buffer.PersistPath)
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

	// Stop auto-save goroutine
	close(autoSaveStop)

	// Save buffer to persistence file if configured
	if cfg.Buffer.PersistPath != "" {
		log.Printf("Saving buffer to %s...", cfg.Buffer.PersistPath)
		if err := buf.Save(cfg.Buffer.PersistPath); err != nil {
			log.Printf("Error saving buffer: %v", err)
		} else {
			log.Printf("Saved %d entries to %s", buf.Count(), cfg.Buffer.PersistPath)
		}
	}

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown error: %v", err)
	}

	log.Println("Server stopped")
}

// startAutoSave periodically saves the buffer to the persistence file
func startAutoSave(buf *buffer.CircularBuffer, path string, intervalMinutes int, stop <-chan struct{}) {
	ticker := time.NewTicker(time.Duration(intervalMinutes) * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := buf.Save(path); err != nil {
				log.Printf("Auto-save error: %v", err)
			} else {
				log.Printf("Auto-saved %d entries to %s", buf.Count(), path)
			}
		case <-stop:
			return
		}
	}
}
