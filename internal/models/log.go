package models

import (
	"encoding/json"
	"fmt"
	"time"
)

// LogEntry represents a single log entry with syslog-style fields
type LogEntry struct {
	ID        uint64    `json:"id"`
	Client    string    `json:"client"`
	Facility  int       `json:"facility"`
	Hostname  string    `json:"hostname"`
	Priority  int       `json:"priority"`
	Severity  int       `json:"severity"`
	Tag       string    `json:"tag"`
	Timestamp time.Time `json:"timestamp"`
	Content   string    `json:"content"`
}

// SeverityLevel represents syslog severity levels
type SeverityLevel int

const (
	SeverityEmergency SeverityLevel = iota // 0 - System is unusable
	SeverityAlert                          // 1 - Action must be taken immediately
	SeverityCritical                       // 2 - Critical conditions
	SeverityError                          // 3 - Error conditions
	SeverityWarning                        // 4 - Warning conditions
	SeverityNotice                         // 5 - Normal but significant condition
	SeverityInfo                           // 6 - Informational messages
	SeverityDebug                          // 7 - Debug-level messages
)

// SeverityName returns the human-readable name for a severity level
func SeverityName(level int) string {
	names := []string{
		"emergency",
		"alert",
		"critical",
		"error",
		"warning",
		"notice",
		"info",
		"debug",
	}
	if level >= 0 && level < len(names) {
		return names[level]
	}
	return "unknown"
}

// Validate checks if the log entry has valid fields
func (e *LogEntry) Validate() error {
	if e.Timestamp.IsZero() {
		return fmt.Errorf("timestamp is required")
	}
	if e.Severity < 0 || e.Severity > 7 {
		return fmt.Errorf("severity must be between 0 and 7")
	}
	return nil
}

// EstimateSize returns an estimate of the memory footprint of this log entry in bytes.
// This includes the struct overhead plus the string contents.
func (e *LogEntry) EstimateSize() int {
	// Base struct size (approximate):
	// - ID: 8 bytes (uint64)
	// - Facility: 8 bytes (int)
	// - Priority: 8 bytes (int)
	// - Severity: 8 bytes (int)
	// - Timestamp: 24 bytes (time.Time)
	// - 4 string headers: 16 bytes each = 64 bytes
	const baseSize = 8 + 8 + 8 + 8 + 24 + 64

	// Add actual string data lengths
	return baseSize + len(e.Client) + len(e.Hostname) + len(e.Tag) + len(e.Content)
}

// IngestPayload represents the expected JSON structure for ingestion
type IngestPayload struct {
	Client    string `json:"client"`
	Facility  int    `json:"facility"`
	Hostname  string `json:"hostname"`
	Priority  int    `json:"priority"`
	Severity  int    `json:"severity"`
	Tag       string `json:"tag"`
	Timestamp string `json:"timestamp"`
	Content   string `json:"content"`
}

// ToLogEntry converts an IngestPayload to a LogEntry
func (p *IngestPayload) ToLogEntry(id uint64) (*LogEntry, error) {
	var ts time.Time
	var err error

	if p.Timestamp != "" {
		// Try parsing various timestamp formats
		formats := []string{
			time.RFC3339,
			time.RFC3339Nano,
			"2006-01-02T15:04:05Z",
			"2006-01-02T15:04:05",
			"2006-01-02 15:04:05",
		}
		for _, format := range formats {
			ts, err = time.Parse(format, p.Timestamp)
			if err == nil {
				break
			}
		}
		if err != nil {
			return nil, fmt.Errorf("invalid timestamp format: %s", p.Timestamp)
		}
	} else {
		ts = time.Now()
	}

	entry := &LogEntry{
		ID:        id,
		Client:    p.Client,
		Facility:  p.Facility,
		Hostname:  p.Hostname,
		Priority:  p.Priority,
		Severity:  p.Severity,
		Tag:       p.Tag,
		Timestamp: ts,
		Content:   p.Content,
	}

	if err := entry.Validate(); err != nil {
		return nil, err
	}

	return entry, nil
}

// LogFilter contains filtering parameters for querying logs
type LogFilter struct {
	Client   []string // Filter by client names (OR logic)
	Hostname []string // Filter by hostnames (OR logic)
	Tag      []string // Filter by tags (OR logic)
	Content  string   // Substring search
	Severity []int    // Filter by severity levels (0-7)
	From     *time.Time
	To       *time.Time
	Page     int
	Limit    int
}

// LogQueryResult contains the result of a log query
type LogQueryResult struct {
	Entries    []LogEntry `json:"entries"`
	TotalCount int        `json:"totalCount"`
	Page       int        `json:"page"`
	Limit      int        `json:"limit"`
	TotalPages int        `json:"totalPages"`
}

// SeverityCounts holds counts for each severity level (0-7)
type SeverityCounts struct {
	Emergency int `json:"emergency"` // 0
	Alert     int `json:"alert"`     // 1
	Critical  int `json:"critical"`  // 2
	Error     int `json:"error"`     // 3
	Warning   int `json:"warning"`   // 4
	Notice    int `json:"notice"`    // 5
	Info      int `json:"info"`      // 6
	Debug     int `json:"debug"`     // 7
}

// HistogramBucket represents a single bucket in the histogram
type HistogramBucket struct {
	Hour       string         `json:"hour"`
	Count      int            `json:"count"`
	BySeverity SeverityCounts `json:"bySeverity"`
}

// Stats contains buffer statistics and histogram data
type Stats struct {
	TotalEntries    int               `json:"totalEntries"`
	BufferSizeBytes int64             `json:"bufferSizeBytes"` // Maximum buffer size in bytes
	UsedSizeBytes   int64             `json:"usedSizeBytes"`   // Current buffer usage in bytes
	OldestTimestamp *time.Time        `json:"oldestTimestamp,omitempty"`
	NewestTimestamp *time.Time        `json:"newestTimestamp,omitempty"`
	Histogram       []HistogramBucket `json:"histogram"`
	BucketMinutes   int               `json:"bucketMinutes"` // Size of each histogram bucket in minutes
}

// HistogramConfig defines the time range and bucket size for histogram generation
type HistogramConfig struct {
	TotalMinutes  int // Total time range in minutes
	BucketMinutes int // Size of each bucket in minutes
}

// Predefined histogram configurations
var (
	// HistogramConfig8h: 8 hours in 5-minute buckets (96 buckets)
	HistogramConfig8h = HistogramConfig{TotalMinutes: 8 * 60, BucketMinutes: 5}
	// HistogramConfig24h: 24 hours in 10-minute buckets (144 buckets)
	HistogramConfig24h = HistogramConfig{TotalMinutes: 24 * 60, BucketMinutes: 10}
	// HistogramConfig5d: 5 days in 60-minute buckets (120 buckets)
	HistogramConfig5d = HistogramConfig{TotalMinutes: 5 * 24 * 60, BucketMinutes: 60}
)

// GetHistogramConfig returns the appropriate configuration for the given range
func GetHistogramConfig(rangeStr string) HistogramConfig {
	switch rangeStr {
	case "8h":
		return HistogramConfig8h
	case "5d":
		return HistogramConfig5d
	default:
		return HistogramConfig24h
	}
}

// TopValueItem represents a single item in a top-N list
type TopValueItem struct {
	Value string `json:"value"`
	Count int    `json:"count"`
}

// TopSeverityItem represents a severity level with its count
type TopSeverityItem struct {
	Level int    `json:"level"`
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// TopStats contains the top values for each field
type TopStats struct {
	Hostnames  []TopValueItem    `json:"hostnames"`
	Tags       []TopValueItem    `json:"tags"`
	Clients    []TopValueItem    `json:"clients"`
	Severities []TopSeverityItem `json:"severities"`
	Total      int               `json:"total"`
}

// WebSocketMessage represents a message sent over WebSocket
type WebSocketMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// MarshalJSON for WebSocketMessage
func (m WebSocketMessage) MarshalJSON() ([]byte, error) {
	type Alias WebSocketMessage
	return json.Marshal(Alias(m))
}
