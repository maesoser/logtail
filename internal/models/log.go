package models

import (
	"encoding/json"
	"fmt"
	"net"
	"time"
)

// LogEntry represents a single log entry with syslog-style fields
type LogEntry struct {
	ID           uint64    `json:"id"`
	Client       string    `json:"client"`
	Facility     int       `json:"facility"`
	Hostname     string    `json:"hostname"`
	Priority     int       `json:"priority"`
	Severity     int       `json:"severity"`
	Tag          string    `json:"tag"`
	Timestamp    time.Time `json:"timestamp"`
	Content      string    `json:"content"`
	Reclassified bool      `json:"reclassified,omitempty"`
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

// sizeClassRound rounds n up to the nearest Go runtime size class, approximating
// the actual heap bytes consumed by a small allocation. This accounts for the
// allocator's size-class granularity (8, 16, 24, 32, 48, 64, 80, 96, 112, 128, …).
func sizeClassRound(n int) int {
	switch {
	case n <= 0:
		return 0
	case n <= 8:
		return 8
	case n <= 16:
		return 16
	case n <= 24:
		return 24
	case n <= 32:
		return 32
	case n <= 48:
		return 48
	case n <= 64:
		return 64
	case n <= 80:
		return 80
	case n <= 96:
		return 96
	case n <= 112:
		return 112
	case n <= 128:
		return 128
	case n <= 144:
		return 144
	case n <= 160:
		return 160
	case n <= 176:
		return 176
	case n <= 192:
		return 192
	case n <= 208:
		return 208
	case n <= 224:
		return 224
	case n <= 240:
		return 240
	case n <= 256:
		return 256
	default:
		// For larger allocations round up to the next 128-byte boundary (approximation)
		return (n + 127) &^ 127
	}
}

// EstimateSize returns an estimate of the memory footprint of this log entry in bytes.
// This includes the struct overhead plus the actual heap bytes consumed by string
// backing arrays (using Go runtime size-class rounding).
//
// Struct layout on amd64 (verified with unsafe.Sizeof):
//   - ID:            8 bytes (uint64)
//   - Client:       16 bytes (string header: ptr + len)
//   - Facility:      8 bytes (int)
//   - Hostname:     16 bytes (string header)
//   - Priority:      8 bytes (int)
//   - Severity:      8 bytes (int)
//   - Tag:          16 bytes (string header)
//   - Timestamp:    24 bytes (time.Time: wall + ext + *Location)
//   - Content:      16 bytes (string header)
//   - Reclassified:  1 byte (bool) + 7 bytes padding
//
// Total struct size: 128 bytes
func (e *LogEntry) EstimateSize() int {
	const structSize = 128 // sizeof(LogEntry) on amd64

	// String backing arrays are separate heap allocations. We apply size-class
	// rounding to better approximate actual RSS rather than using raw len().
	// Interned fields (Client, Hostname, Tag) share backing arrays across entries,
	// so their heap cost is amortised — we still account for the string header
	// within the struct (already included in structSize) but charge only the
	// raw byte length for the backing array to avoid over-counting shared memory.
	return structSize +
		sizeClassRound(len(e.Client)) +
		sizeClassRound(len(e.Hostname)) +
		sizeClassRound(len(e.Tag)) +
		sizeClassRound(len(e.Content))
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

	client := p.Client
	if host, _, err := net.SplitHostPort(client); err == nil {
		client = host
	}

	entry := &LogEntry{
		ID:        id,
		Client:    client,
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
	TotalMinutes  int    // Total time range in minutes
	BucketMinutes int    // Size of each bucket in minutes
	LabelFormat   string // Go time format string for bucket labels (e.g. "15:04" or "01/02 15")
}

// Predefined histogram configurations
var (
	// HistogramConfig8h: 8 hours in 5-minute buckets (96 buckets)
	HistogramConfig8h = HistogramConfig{TotalMinutes: 8 * 60, BucketMinutes: 5, LabelFormat: "15:04"}
	// HistogramConfig24h: 24 hours in 10-minute buckets (144 buckets)
	HistogramConfig24h = HistogramConfig{TotalMinutes: 24 * 60, BucketMinutes: 10, LabelFormat: "15:04"}
	// HistogramConfig5d: 5 days in 60-minute buckets (120 buckets)
	HistogramConfig5d = HistogramConfig{TotalMinutes: 5 * 24 * 60, BucketMinutes: 60, LabelFormat: "01/02 15:04"}
	// HistogramConfig21d: 21 days in 180-minute (3-hour) buckets (168 buckets)
	HistogramConfig21d = HistogramConfig{TotalMinutes: 21 * 24 * 60, BucketMinutes: 180, LabelFormat: "01/02 15:04"}
)

// GetHistogramConfig returns the appropriate configuration for the given range
func GetHistogramConfig(rangeStr string) HistogramConfig {
	switch rangeStr {
	case "8h":
		return HistogramConfig8h
	case "5d":
		return HistogramConfig5d
	case "21d":
		return HistogramConfig21d
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
