package config

import (
	"flag"
	"fmt"
)

// Config holds application configuration
type Config struct {
	Port         int
	BufferSizeMB int // Buffer size limit in megabytes
	DevMode      bool
	IngestToken  string // Authorization token for ingest endpoint (optional)
}

// DefaultConfig returns the default configuration
func DefaultConfig() *Config {
	return &Config{
		Port:         8080,
		BufferSizeMB: 100, // 100 MB default
		DevMode:      false,
		IngestToken:  "",
	}
}

// ParseFlags parses command-line flags and returns the configuration
func ParseFlags() *Config {
	cfg := DefaultConfig()

	flag.IntVar(&cfg.Port, "port", cfg.Port, "HTTP server port")
	flag.IntVar(&cfg.BufferSizeMB, "buffer-size-mb", cfg.BufferSizeMB, "Maximum buffer size in megabytes")
	flag.BoolVar(&cfg.DevMode, "dev", cfg.DevMode, "Enable development mode (serves frontend from filesystem)")
	flag.StringVar(&cfg.IngestToken, "ingest-token", cfg.IngestToken, "Authorization token for ingest endpoint (if empty, no auth required)")

	flag.Parse()

	return cfg
}

// BufferSizeBytes returns the buffer size in bytes
func (c *Config) BufferSizeBytes() int64 {
	return int64(c.BufferSizeMB) * 1024 * 1024
}

// Validate checks if the configuration is valid
func (c *Config) Validate() error {
	if c.Port < 1 || c.Port > 65535 {
		return fmt.Errorf("port must be between 1 and 65535")
	}
	if c.BufferSizeMB < 1 {
		return fmt.Errorf("buffer-size-mb must be at least 1")
	}
	return nil
}

// String returns a string representation of the configuration
func (c *Config) String() string {
	hasToken := c.IngestToken != ""
	return fmt.Sprintf("Config{Port: %d, BufferSizeMB: %d, DevMode: %v, IngestToken: %v}", c.Port, c.BufferSizeMB, c.DevMode, hasToken)
}
