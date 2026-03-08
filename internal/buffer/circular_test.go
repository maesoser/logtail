package buffer

import (
	"testing"
	"time"

	"github.com/logtail/logtail/internal/models"
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

func TestCircularBuffer_OutOfOrderInsertion(t *testing.T) {
	// Create buffer with 1 hour reorder window (default)
	buf := New(100 * 1024)

	now := time.Now()

	// Insert logs out of order: t+2, t+0, t+1
	entries := []struct {
		offset  time.Duration
		content string
	}{
		{2 * time.Minute, "message at t+2"},
		{0, "message at t+0"},
		{1 * time.Minute, "message at t+1"},
	}

	for _, e := range entries {
		buf.Add(models.LogEntry{
			Client:    "test",
			Timestamp: now.Add(e.offset),
			Content:   e.content,
		})
	}

	// Query all entries - they should be in timestamp order
	result := buf.Query(models.LogFilter{})
	if result.TotalCount != 3 {
		t.Fatalf("expected 3 entries, got %d", result.TotalCount)
	}

	// Results are returned newest-first by Query, so reverse order expected
	// Entry 0 should be newest (t+2), Entry 2 should be oldest (t+0)
	if result.Entries[0].Content != "message at t+2" {
		t.Errorf("expected newest entry to be 't+2', got '%s'", result.Entries[0].Content)
	}
	if result.Entries[1].Content != "message at t+1" {
		t.Errorf("expected middle entry to be 't+1', got '%s'", result.Entries[1].Content)
	}
	if result.Entries[2].Content != "message at t+0" {
		t.Errorf("expected oldest entry to be 't+0', got '%s'", result.Entries[2].Content)
	}
}

func TestCircularBuffer_OutOfOrderInsertionMultiple(t *testing.T) {
	buf := New(100 * 1024)

	now := time.Now()

	// Insert 10 logs in random order
	offsets := []int{5, 2, 8, 1, 9, 3, 7, 0, 6, 4}

	for _, offset := range offsets {
		buf.Add(models.LogEntry{
			Client:    "test",
			Timestamp: now.Add(time.Duration(offset) * time.Minute),
			Content:   string(rune('0' + offset)), // "0", "1", "2", etc.
		})
	}

	// Query all entries
	result := buf.Query(models.LogFilter{})
	if result.TotalCount != 10 {
		t.Fatalf("expected 10 entries, got %d", result.TotalCount)
	}

	// Results should be in descending timestamp order (newest first)
	for i := 0; i < 10; i++ {
		expected := string(rune('0' + (9 - i))) // "9", "8", "7", ...
		if result.Entries[i].Content != expected {
			t.Errorf("entry %d: expected content '%s', got '%s'", i, expected, result.Entries[i].Content)
		}
	}
}

func TestCircularBuffer_OutOfOrderBeyondWindow(t *testing.T) {
	// Create buffer with 30-minute reorder window
	buf := NewWithReorderWindow(100*1024, 30*time.Minute)

	now := time.Now()

	// Add an entry at "now"
	buf.Add(models.LogEntry{
		Client:    "test",
		Timestamp: now,
		Content:   "current",
	})

	// Add an entry 20 minutes ago (within window) - should be reordered
	buf.Add(models.LogEntry{
		Client:    "test",
		Timestamp: now.Add(-20 * time.Minute),
		Content:   "20min-ago",
	})

	// Add an entry 2 hours ago (outside window) - should NOT be reordered
	buf.Add(models.LogEntry{
		Client:    "test",
		Timestamp: now.Add(-2 * time.Hour),
		Content:   "2hours-ago",
	})

	result := buf.Query(models.LogFilter{})
	if result.TotalCount != 3 {
		t.Fatalf("expected 3 entries, got %d", result.TotalCount)
	}

	// Newest should be "current", then "2hours-ago" (appended, not reordered),
	// then "20min-ago" (reordered to its correct position)
	// Actually, let's verify the actual positions:
	// Buffer order after insertions:
	// 1. Add "current" at now -> buffer: [current]
	// 2. Add "20min-ago" -> within window, inserted before "current" -> buffer: [20min-ago, current]
	// 3. Add "2hours-ago" -> outside window, appended -> buffer: [20min-ago, current, 2hours-ago]
	// Query returns newest-first by iteration order (head to tail)

	// The "2hours-ago" was appended at head, so it appears newest in query
	if result.Entries[0].Content != "2hours-ago" {
		t.Errorf("expected newest entry to be '2hours-ago' (appended), got '%s'", result.Entries[0].Content)
	}
	if result.Entries[1].Content != "current" {
		t.Errorf("expected middle entry to be 'current', got '%s'", result.Entries[1].Content)
	}
	if result.Entries[2].Content != "20min-ago" {
		t.Errorf("expected oldest entry to be '20min-ago', got '%s'", result.Entries[2].Content)
	}
}

func TestCircularBuffer_ReorderWindowZero(t *testing.T) {
	// With zero reorder window, no reordering should happen
	buf := NewWithReorderWindow(100*1024, 0)

	now := time.Now()

	// Insert out of order
	buf.Add(models.LogEntry{Timestamp: now.Add(2 * time.Minute), Content: "t+2"})
	buf.Add(models.LogEntry{Timestamp: now, Content: "t+0"})
	buf.Add(models.LogEntry{Timestamp: now.Add(1 * time.Minute), Content: "t+1"})

	result := buf.Query(models.LogFilter{})

	// Should be in insertion order (no reordering with zero window)
	// Query returns newest-first (by buffer position), so last inserted first
	if result.Entries[0].Content != "t+1" {
		t.Errorf("expected first entry 't+1', got '%s'", result.Entries[0].Content)
	}
	if result.Entries[1].Content != "t+0" {
		t.Errorf("expected second entry 't+0', got '%s'", result.Entries[1].Content)
	}
	if result.Entries[2].Content != "t+2" {
		t.Errorf("expected third entry 't+2', got '%s'", result.Entries[2].Content)
	}
}

func TestCircularBuffer_OrderedInsertionWithEviction(t *testing.T) {
	// Create a small buffer that will need to evict
	buf := NewWithReorderWindow(1024, 1*time.Hour)

	now := time.Now()

	// Add entries until we trigger eviction
	for i := 0; i < 20; i++ {
		buf.Add(models.LogEntry{
			Client:    "test",
			Timestamp: now.Add(time.Duration(i) * time.Second),
			Content:   "message with some content to take up space in the buffer",
		})
	}

	// Buffer should have evicted some entries
	if buf.Count() >= 20 {
		t.Errorf("expected some entries to be evicted, count is %d", buf.Count())
	}

	// Remaining entries should still be in timestamp order
	result := buf.Query(models.LogFilter{})
	for i := 0; i < len(result.Entries)-1; i++ {
		current := result.Entries[i].Timestamp
		next := result.Entries[i+1].Timestamp
		// Query returns newest-first, so current should be >= next
		if current.Before(next) {
			t.Errorf("entries not in order: entry %d (%v) before entry %d (%v)",
				i, current, i+1, next)
		}
	}
}

func TestNewWithReorderWindow(t *testing.T) {
	tests := []struct {
		name          string
		reorderWindow time.Duration
		wantWindow    time.Duration
	}{
		{"positive window", 30 * time.Minute, 30 * time.Minute},
		{"zero window", 0, 0},
		{"negative uses default", -1 * time.Hour, DefaultReorderWindow},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf := NewWithReorderWindow(1024, tt.reorderWindow)
			if buf.reorderWindow != tt.wantWindow {
				t.Errorf("expected reorder window %v, got %v", tt.wantWindow, buf.reorderWindow)
			}
		})
	}
}
