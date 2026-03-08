package models

import (
	"encoding/json"
	"os"
	"sync"
)

// Settings contains application configuration that can be modified at runtime
type Settings struct {
	// IngestToken is the authentication token required for the ingest endpoint
	// If empty, no authentication is required
	IngestToken string `json:"ingestToken"`

	// ExclusionPatterns is a list of strings that, if found in a log message,
	// will cause that message to be discarded during ingestion
	ExclusionPatterns []string `json:"exclusionPatterns"`
}

// SettingsStore provides thread-safe access to settings with optional file persistence
type SettingsStore struct {
	settings Settings
	mu       sync.RWMutex
	filePath string
}

// NewSettingsStore creates a new settings store
// If filePath is provided, settings will be persisted to disk
func NewSettingsStore(filePath string, initialToken string) *SettingsStore {
	store := &SettingsStore{
		settings: Settings{
			IngestToken:       initialToken,
			ExclusionPatterns: []string{},
		},
		filePath: filePath,
	}

	// Try to load settings from file if it exists
	if filePath != "" {
		if err := store.loadFromFile(); err != nil {
			// File doesn't exist or is invalid, use defaults
			// If an initial token was provided via CLI, use it
			if initialToken != "" {
				store.settings.IngestToken = initialToken
			}
		}
	}

	return store
}

// Get returns a copy of the current settings
func (s *SettingsStore) Get() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Return a copy to avoid race conditions
	return Settings{
		IngestToken:       s.settings.IngestToken,
		ExclusionPatterns: append([]string{}, s.settings.ExclusionPatterns...),
	}
}

// Update updates the settings and persists them if a file path is configured
func (s *SettingsStore) Update(settings Settings) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.settings = Settings{
		IngestToken:       settings.IngestToken,
		ExclusionPatterns: append([]string{}, settings.ExclusionPatterns...),
	}

	if s.filePath != "" {
		return s.saveToFile()
	}
	return nil
}

// GetIngestToken returns the current ingest token
func (s *SettingsStore) GetIngestToken() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings.IngestToken
}

// GetExclusionPatterns returns a copy of the current exclusion patterns
func (s *SettingsStore) GetExclusionPatterns() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]string{}, s.settings.ExclusionPatterns...)
}

// loadFromFile loads settings from the configured file path
func (s *SettingsStore) loadFromFile() error {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}

	var settings Settings
	if err := json.Unmarshal(data, &settings); err != nil {
		return err
	}

	s.settings = settings
	return nil
}

// saveToFile saves settings to the configured file path
func (s *SettingsStore) saveToFile() error {
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.filePath, data, 0600)
}
