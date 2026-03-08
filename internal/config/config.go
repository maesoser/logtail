package config

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
)

// CLIConfig holds command-line only configuration (not persisted)
type CLIConfig struct {
	// ConfigFile is the path to the YAML configuration file
	ConfigFile string

	// DevMode enables development mode (serves frontend from filesystem)
	DevMode bool
}

// ParseFlags parses command-line flags and returns the CLI configuration
func ParseFlags() *CLIConfig {
	cfg := &CLIConfig{}

	// Determine default config file path
	defaultConfigPath := ""
	if configDir, err := os.UserConfigDir(); err == nil {
		defaultConfigPath = filepath.Join(configDir, "logtail", "config.yaml")
	}

	flag.StringVar(&cfg.ConfigFile, "config", defaultConfigPath, "Path to YAML configuration file")
	flag.BoolVar(&cfg.DevMode, "dev", false, "Enable development mode (serves frontend from filesystem)")

	flag.Parse()

	return cfg
}

// EnsureConfigDir ensures the directory for the config file exists
func EnsureConfigDir(configPath string) error {
	dir := filepath.Dir(configPath)
	return os.MkdirAll(dir, 0755)
}

// String returns a string representation of the CLI configuration
func (c *CLIConfig) String() string {
	return fmt.Sprintf("CLIConfig{ConfigFile: %s, DevMode: %v}", c.ConfigFile, c.DevMode)
}
