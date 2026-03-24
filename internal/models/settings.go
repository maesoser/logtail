package models

import (
	"os"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

// Config contains all application configuration stored in YAML format
type Config struct {
	// Server settings
	Server ServerConfig `yaml:"server" json:"server"`

	// Ingest settings
	Ingest IngestConfig `yaml:"ingest" json:"ingest"`

	// Buffer settings
	Buffer BufferConfig `yaml:"buffer" json:"buffer"`
}

// ServerConfig contains HTTP server configuration
type ServerConfig struct {
	// Port is the HTTP server port (1-65535)
	Port int `yaml:"port" json:"port"`
}

// IngestConfig contains ingestion configuration
type IngestConfig struct {
	// AuthToken is the authentication token required for the ingest endpoint
	// If empty, no authentication is required
	AuthToken string `yaml:"auth_token" json:"authToken"`

	// ExclusionPatterns is a list of strings that, if found in a log message,
	// will cause that message to be discarded during ingestion
	ExclusionPatterns []string `yaml:"exclusion_patterns" json:"exclusionPatterns"`
}

// BufferConfig contains buffer configuration
type BufferConfig struct {
	// SizeMB is the maximum buffer size in megabytes
	SizeMB int `yaml:"size_mb" json:"sizeMB"`

	// RetentionDays is the maximum age in days for log entries
	// Entries older than this will be evicted. If 0, no time-based eviction.
	RetentionDays int `yaml:"retention_days" json:"retentionDays"`

	// PersistPath is the file path for buffer persistence
	// If empty, persistence is disabled
	PersistPath string `yaml:"persist_path,omitempty" json:"persistPath"`

	// AutoSaveMinutes is the interval in minutes for periodic auto-save
	// If 0 or negative, auto-save is disabled (only saves on shutdown)
	AutoSaveMinutes int `yaml:"auto_save_minutes,omitempty" json:"autoSaveMinutes"`
}

// DefaultConfig returns the default configuration
func DefaultConfig() Config {
	return Config{
		Server: ServerConfig{
			Port: 8080,
		},
		Ingest: IngestConfig{
			AuthToken:         "",
			ExclusionPatterns: []string{},
		},
		Buffer: BufferConfig{
			SizeMB:        100,
			RetentionDays: 30,
		},
	}
}

// Validate checks if the configuration is valid
func (c *Config) Validate() error {
	if c.Server.Port < 1 || c.Server.Port > 65535 {
		return &ConfigError{Field: "server.port", Message: "must be between 1 and 65535"}
	}
	if c.Buffer.SizeMB < 1 {
		return &ConfigError{Field: "buffer.size_mb", Message: "must be at least 1"}
	}
	if c.Buffer.RetentionDays < 0 {
		return &ConfigError{Field: "buffer.retention_days", Message: "must be >= 0"}
	}
	return nil
}

// BufferSizeBytes returns the buffer size in bytes
func (c *Config) BufferSizeBytes() int64 {
	return int64(c.Buffer.SizeMB) * 1024 * 1024
}

// RetentionDuration returns the retention period as time.Duration.
// Returns 0 if retention is disabled (RetentionDays <= 0).
func (c *Config) RetentionDuration() time.Duration {
	if c.Buffer.RetentionDays <= 0 {
		return 0
	}
	return time.Duration(c.Buffer.RetentionDays) * 24 * time.Hour
}

// ConfigError represents a configuration validation error
type ConfigError struct {
	Field   string
	Message string
}

func (e *ConfigError) Error() string {
	return e.Field + ": " + e.Message
}

// ConfigStore provides thread-safe access to configuration with YAML file persistence
type ConfigStore struct {
	config   Config
	mu       sync.RWMutex
	filePath string
}

// NewConfigStore creates a new config store
// If filePath is provided and exists, configuration will be loaded from it
// Otherwise, default configuration is used and saved to the file
func NewConfigStore(filePath string) *ConfigStore {
	store := &ConfigStore{
		config:   DefaultConfig(),
		filePath: filePath,
	}

	if filePath != "" {
		if err := store.loadFromFile(); err != nil {
			// File doesn't exist or is invalid, save defaults
			_ = store.saveToFile()
		}
	}

	return store
}

// Get returns a copy of the current configuration
func (s *ConfigStore) Get() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Return a deep copy to avoid race conditions
	return Config{
		Server: ServerConfig{
			Port: s.config.Server.Port,
		},
		Ingest: IngestConfig{
			AuthToken:         s.config.Ingest.AuthToken,
			ExclusionPatterns: append([]string{}, s.config.Ingest.ExclusionPatterns...),
		},
		Buffer: BufferConfig{
			SizeMB:          s.config.Buffer.SizeMB,
			RetentionDays:   s.config.Buffer.RetentionDays,
			PersistPath:     s.config.Buffer.PersistPath,
			AutoSaveMinutes: s.config.Buffer.AutoSaveMinutes,
		},
	}
}

// Update updates the configuration and persists it to the file
func (s *ConfigStore) Update(config Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Validate before updating
	if err := config.Validate(); err != nil {
		return err
	}

	s.config = Config{
		Server: ServerConfig{
			Port: config.Server.Port,
		},
		Ingest: IngestConfig{
			AuthToken:         config.Ingest.AuthToken,
			ExclusionPatterns: append([]string{}, config.Ingest.ExclusionPatterns...),
		},
		Buffer: BufferConfig{
			SizeMB:          config.Buffer.SizeMB,
			RetentionDays:   config.Buffer.RetentionDays,
			PersistPath:     config.Buffer.PersistPath,
			AutoSaveMinutes: config.Buffer.AutoSaveMinutes,
		},
	}

	if s.filePath != "" {
		return s.saveToFile()
	}
	return nil
}

// GetPort returns the configured server port
func (s *ConfigStore) GetPort() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.Server.Port
}

// GetBufferSizeMB returns the configured buffer size in MB
func (s *ConfigStore) GetBufferSizeMB() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.Buffer.SizeMB
}

// GetBufferSizeBytes returns the configured buffer size in bytes
func (s *ConfigStore) GetBufferSizeBytes() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return int64(s.config.Buffer.SizeMB) * 1024 * 1024
}

// GetIngestToken returns the current ingest auth token
func (s *ConfigStore) GetIngestToken() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.Ingest.AuthToken
}

// GetExclusionPatterns returns a copy of the current exclusion patterns
func (s *ConfigStore) GetExclusionPatterns() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]string{}, s.config.Ingest.ExclusionPatterns...)
}

// GetFilePath returns the config file path
func (s *ConfigStore) GetFilePath() string {
	return s.filePath
}

// GetPersistPath returns the buffer persistence file path
func (s *ConfigStore) GetPersistPath() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.Buffer.PersistPath
}

// GetAutoSaveMinutes returns the auto-save interval in minutes
func (s *ConfigStore) GetAutoSaveMinutes() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.Buffer.AutoSaveMinutes
}

// loadFromFile loads configuration from the YAML file
func (s *ConfigStore) loadFromFile() error {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return err
	}

	// Ensure exclusion patterns is not nil
	if config.Ingest.ExclusionPatterns == nil {
		config.Ingest.ExclusionPatterns = []string{}
	}

	s.config = config
	return nil
}

// saveToFile saves configuration to the YAML file
func (s *ConfigStore) saveToFile() error {
	data, err := yaml.Marshal(s.config)
	if err != nil {
		return err
	}

	return os.WriteFile(s.filePath, data, 0600)
}
