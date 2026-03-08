package buffer

import (
	"testing"
	"time"

	"github.com/webtail/webtail/internal/models"
)

func TestNew(t *testing.T) {
	tests := []struct {
		name         string
		maxSizeBytes int64
		wantDefault  bool
	}{
		{"with valid size", 1024 * 1024, false},
		{"with zero uses default", 0, true},
		{"with negative uses default", -100, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf := New(tt.maxSizeBytes)
			if tt.wantDefault {
				if buf.MaxSizeBytes() != DefaultMaxSizeBytes {
					t.Errorf("expected default size %d, got %d", DefaultMaxSizeBytes, buf.MaxSizeBytes())
				}
			} else {
				if buf.MaxSizeBytes() != tt.maxSizeBytes {
					t.Errorf("expected size %d, got %d", tt.maxSizeBytes, buf.MaxSizeBytes())
				}
			}
		})
	}
}

func TestCircularBuffer_Add(t *testing.T) {
	buf := New(10 * 1024) // 10 KB buffer

	entry := models.LogEntry{
		Client:    "test-client",
		Hostname:  "localhost",
		Severity:  6,
		Tag:       "test",
		Timestamp: time.Now(),
		Content:   "test message",
	}

	added := buf.Add(entry)

	if added.ID != 1 {
		t.Errorf("expected ID 1, got %d", added.ID)
	}
	if buf.Count() != 1 {
		t.Errorf("expected count 1, got %d", buf.Count())
	}
	if buf.CurrentSizeBytes() <= 0 {
		t.Errorf("expected positive size, got %d", buf.CurrentSizeBytes())
	}
}

func TestCircularBuffer_EvictsWhenFull(t *testing.T) {
	// Create a very small buffer (1 KB)
	buf := New(1024)

	// Add entries until we exceed the buffer size
	// Each entry with ~100 byte content should be ~220 bytes total
	for i := 0; i < 10; i++ {
		entry := models.LogEntry{
			Client:    "test-client",
			Hostname:  "localhost",
			Severity:  6,
			Tag:       "test",
			Timestamp: time.Now(),
			Content:   "this is a test message that is about 100 bytes long to make testing easier to predict the size",
		}
		buf.Add(entry)
	}

	// Buffer should not exceed maxSizeBytes
	if buf.CurrentSizeBytes() > buf.MaxSizeBytes() {
		t.Errorf("buffer exceeded max size: current=%d, max=%d", buf.CurrentSizeBytes(), buf.MaxSizeBytes())
	}

	// Should have evicted some entries (count should be less than 10)
	if buf.Count() >= 10 {
		t.Errorf("expected entries to be evicted, but count is %d", buf.Count())
	}
}

func TestCircularBuffer_Query(t *testing.T) {
	buf := New(100 * 1024) // 100 KB

	// Add some entries
	for i := 0; i < 5; i++ {
		entry := models.LogEntry{
			Client:    "client-a",
			Hostname:  "host-1",
			Severity:  i % 8,
			Tag:       "app",
			Timestamp: time.Now(),
			Content:   "test message",
		}
		buf.Add(entry)
	}

	// Query all
	result := buf.Query(models.LogFilter{})
	if result.TotalCount != 5 {
		t.Errorf("expected 5 entries, got %d", result.TotalCount)
	}

	// Query with client filter
	result = buf.Query(models.LogFilter{Client: []string{"client-a"}})
	if result.TotalCount != 5 {
		t.Errorf("expected 5 entries for client-a, got %d", result.TotalCount)
	}

	result = buf.Query(models.LogFilter{Client: []string{"client-b"}})
	if result.TotalCount != 0 {
		t.Errorf("expected 0 entries for client-b, got %d", result.TotalCount)
	}
}

func TestCircularBuffer_Clear(t *testing.T) {
	buf := New(10 * 1024)

	// Add some entries
	for i := 0; i < 3; i++ {
		buf.Add(models.LogEntry{
			Client:    "test",
			Timestamp: time.Now(),
			Content:   "message",
		})
	}

	if buf.Count() != 3 {
		t.Errorf("expected count 3 before clear, got %d", buf.Count())
	}

	buf.Clear()

	if buf.Count() != 0 {
		t.Errorf("expected count 0 after clear, got %d", buf.Count())
	}
	if buf.CurrentSizeBytes() != 0 {
		t.Errorf("expected size 0 after clear, got %d", buf.CurrentSizeBytes())
	}
}

func TestCircularBuffer_GetUniqueValues(t *testing.T) {
	buf := New(100 * 1024)

	entries := []models.LogEntry{
		{Client: "client-a", Hostname: "host-1", Tag: "app", Timestamp: time.Now()},
		{Client: "client-b", Hostname: "host-1", Tag: "web", Timestamp: time.Now()},
		{Client: "client-a", Hostname: "host-2", Tag: "app", Timestamp: time.Now()},
	}

	for _, e := range entries {
		buf.Add(e)
	}

	clients := buf.GetUniqueValues("client")
	if len(clients) != 2 {
		t.Errorf("expected 2 unique clients, got %d", len(clients))
	}

	hostnames := buf.GetUniqueValues("hostname")
	if len(hostnames) != 2 {
		t.Errorf("expected 2 unique hostnames, got %d", len(hostnames))
	}

	tags := buf.GetUniqueValues("tag")
	if len(tags) != 2 {
		t.Errorf("expected 2 unique tags, got %d", len(tags))
	}
}

func TestCircularBuffer_GrowsCapacity(t *testing.T) {
	// Create buffer with small initial capacity but large size limit
	buf := New(10 * 1024 * 1024) // 10 MB

	// Add more entries than initial capacity (10000)
	// Each entry is small, so we should grow without eviction
	initialCapacity := buf.capacity

	// Add enough small entries to trigger growth
	for i := 0; i < initialCapacity+100; i++ {
		buf.Add(models.LogEntry{
			Client:    "c",
			Timestamp: time.Now(),
			Content:   "x",
		})
	}

	if buf.Count() != initialCapacity+100 {
		t.Errorf("expected %d entries, got %d", initialCapacity+100, buf.Count())
	}

	if buf.capacity <= initialCapacity {
		t.Errorf("expected capacity to grow beyond %d, got %d", initialCapacity, buf.capacity)
	}
}

func TestLogEntry_EstimateSize(t *testing.T) {
	entry := models.LogEntry{
		ID:        1,
		Client:    "test-client", // 11 chars
		Hostname:  "localhost",   // 9 chars
		Tag:       "app",         // 3 chars
		Content:   "hello world", // 11 chars
		Timestamp: time.Now(),
		Severity:  6,
		Facility:  1,
		Priority:  14,
	}

	size := entry.EstimateSize()

	// Base size (120) + string lengths (11 + 9 + 3 + 11 = 34) = 154
	expectedMin := 120 + 11 + 9 + 3 + 11
	if size < expectedMin {
		t.Errorf("expected size >= %d, got %d", expectedMin, size)
	}
}
