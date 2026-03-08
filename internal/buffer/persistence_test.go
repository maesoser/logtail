package buffer

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/logtail/logtail/internal/models"
)

func TestSaveAndLoad(t *testing.T) {
	// Create a temporary directory for the test
	tmpDir, err := os.MkdirTemp("", "logtail-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	persistPath := filepath.Join(tmpDir, "buffer.dat")

	// Create buffer and add some entries
	buf := New(1024 * 1024) // 1 MB

	entries := []models.LogEntry{
		{Client: "client1", Hostname: "host1", Tag: "app", Severity: 6, Content: "Test message 1", Timestamp: time.Now().Add(-2 * time.Hour)},
		{Client: "client2", Hostname: "host2", Tag: "app", Severity: 4, Content: "Test message 2", Timestamp: time.Now().Add(-1 * time.Hour)},
		{Client: "client3", Hostname: "host3", Tag: "app", Severity: 3, Content: "Test message 3", Timestamp: time.Now()},
	}

	for _, e := range entries {
		buf.Add(e)
	}

	// Save buffer
	if err := buf.Save(persistPath); err != nil {
		t.Fatalf("Failed to save buffer: %v", err)
	}

	// Verify file exists
	if _, err := os.Stat(persistPath); os.IsNotExist(err) {
		t.Fatal("Persistence file was not created")
	}

	// Create new buffer and load
	buf2 := New(1024 * 1024)
	if err := buf2.Load(persistPath); err != nil {
		t.Fatalf("Failed to load buffer: %v", err)
	}

	// Verify entries were restored
	if buf2.Count() != len(entries) {
		t.Errorf("Expected %d entries, got %d", len(entries), buf2.Count())
	}

	// Query and verify content
	result := buf2.Query(models.LogFilter{Page: 1, Limit: 10})
	if len(result.Entries) != len(entries) {
		t.Errorf("Expected %d entries in query, got %d", len(entries), len(result.Entries))
	}

	// Query returns entries in reverse order (newest first)
	// So result[0] should be entries[2], result[1] should be entries[1], etc.
	for i, e := range result.Entries {
		expectedIdx := len(entries) - 1 - i
		if e.Content != entries[expectedIdx].Content {
			t.Errorf("Entry %d content mismatch: expected %q, got %q", i, entries[expectedIdx].Content, e.Content)
		}
	}
}

func TestLoadTruncatesOldEntries(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "logtail-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	persistPath := filepath.Join(tmpDir, "buffer.dat")

	// Create a large buffer and add many entries
	buf := New(10 * 1024 * 1024) // 10 MB

	// Add entries that will exceed 1KB total
	for i := 0; i < 100; i++ {
		buf.Add(models.LogEntry{
			Client:    "client",
			Hostname:  "host",
			Tag:       "app",
			Severity:  6,
			Content:   "This is a test message with some content to take up space " + string(rune('A'+i%26)),
			Timestamp: time.Now().Add(-time.Duration(100-i) * time.Minute),
		})
	}

	// Save with large buffer
	if err := buf.Save(persistPath); err != nil {
		t.Fatalf("Failed to save buffer: %v", err)
	}

	// Load into a smaller buffer - should truncate old entries
	smallBuf := New(5 * 1024) // 5 KB - will only fit some entries
	if err := smallBuf.Load(persistPath); err != nil {
		t.Fatalf("Failed to load buffer: %v", err)
	}

	// Verify we loaded fewer entries than we saved
	if smallBuf.Count() >= buf.Count() {
		t.Errorf("Expected fewer entries after truncation, got %d (original: %d)", smallBuf.Count(), buf.Count())
	}

	// Verify the newest entries were kept (they should have higher IDs)
	result := smallBuf.Query(models.LogFilter{Page: 1, Limit: 1000})
	if len(result.Entries) > 0 {
		// Query returns newest first, so the first entry should have the highest ID (100)
		firstEntry := result.Entries[0]
		if firstEntry.ID != 100 {
			t.Errorf("Expected newest entry to have ID 100, got %d", firstEntry.ID)
		}
	}
}

func TestLoadEmptyPath(t *testing.T) {
	buf := New(1024 * 1024)
	err := buf.Load("")
	if err == nil {
		t.Error("Expected error when loading with empty path")
	}
}

func TestSaveEmptyPath(t *testing.T) {
	buf := New(1024 * 1024)
	err := buf.Save("")
	if err == nil {
		t.Error("Expected error when saving with empty path")
	}
}

func TestLoadNonexistentFile(t *testing.T) {
	buf := New(1024 * 1024)
	err := buf.Load("/nonexistent/path/buffer.dat")
	if err == nil {
		t.Error("Expected error when loading nonexistent file")
	}
}

func TestSaveCreatesDirectory(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "logtail-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Use a nested path that doesn't exist
	persistPath := filepath.Join(tmpDir, "nested", "deep", "buffer.dat")

	buf := New(1024 * 1024)
	buf.Add(models.LogEntry{
		Content:   "Test",
		Timestamp: time.Now(),
	})

	if err := buf.Save(persistPath); err != nil {
		t.Fatalf("Failed to save buffer to nested path: %v", err)
	}

	// Verify file exists
	if _, err := os.Stat(persistPath); os.IsNotExist(err) {
		t.Fatal("Persistence file was not created in nested directory")
	}
}

func TestAtomicWrite(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "logtail-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	persistPath := filepath.Join(tmpDir, "buffer.dat")

	buf := New(1024 * 1024)
	buf.Add(models.LogEntry{
		Content:   "Test",
		Timestamp: time.Now(),
	})

	// Save first version
	if err := buf.Save(persistPath); err != nil {
		t.Fatalf("Failed to save buffer: %v", err)
	}

	// Verify no temp file remains
	tmpPath := persistPath + ".tmp"
	if _, err := os.Stat(tmpPath); !os.IsNotExist(err) {
		t.Error("Temp file should not exist after successful save")
	}
}
