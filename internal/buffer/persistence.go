package buffer

import (
	"compress/gzip"
	"encoding/gob"
	"fmt"
	"os"
	"path/filepath"
	"sync/atomic"
	"time"

	"github.com/logtail/logtail/internal/models"
)

// Snapshot represents the serializable state of the buffer
type Snapshot struct {
	IDSeq     uint64            // Next ID to assign
	Entries   []models.LogEntry // All entries in order (oldest to newest)
	CreatedAt time.Time         // When snapshot was created
}

// Save writes the buffer state to a gzipped gob file.
// It uses atomic write (temp file + rename) to prevent corruption.
func (b *CircularBuffer) Save(path string) error {
	if path == "" {
		return fmt.Errorf("persistence path is empty")
	}

	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory %s: %w", dir, err)
	}

	// Create snapshot under read lock
	snapshot := b.createSnapshot()

	// Write to temp file first for atomic operation
	tmpPath := path + ".tmp"

	f, err := os.Create(tmpPath)
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}

	// Use gzip compression
	gw := gzip.NewWriter(f)
	enc := gob.NewEncoder(gw)

	if err := enc.Encode(snapshot); err != nil {
		gw.Close()
		f.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("failed to encode snapshot: %w", err)
	}

	if err := gw.Close(); err != nil {
		f.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("failed to close gzip writer: %w", err)
	}

	if err := f.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("failed to close file: %w", err)
	}

	// Atomic rename
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("failed to rename temp file: %w", err)
	}

	return nil
}

// createSnapshot creates a snapshot of the current buffer state
func (b *CircularBuffer) createSnapshot() Snapshot {
	b.mu.RLock()
	defer b.mu.RUnlock()

	// Extract entries in order (oldest to newest)
	entries := make([]models.LogEntry, b.count)
	for i := 0; i < b.count; i++ {
		idx := (b.tail + i) % b.capacity
		entries[i] = b.entries[idx]
	}

	return Snapshot{
		IDSeq:     atomic.LoadUint64(&b.idSeq),
		Entries:   entries,
		CreatedAt: time.Now().UTC(),
	}
}

// Load restores buffer state from a gzipped gob file.
// If the persisted data exceeds maxSizeBytes, oldest entries are truncated.
func (b *CircularBuffer) Load(path string) error {
	if path == "" {
		return fmt.Errorf("persistence path is empty")
	}

	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	gr, err := gzip.NewReader(f)
	if err != nil {
		return fmt.Errorf("failed to create gzip reader: %w", err)
	}
	defer gr.Close()

	dec := gob.NewDecoder(gr)

	var snapshot Snapshot
	if err := dec.Decode(&snapshot); err != nil {
		return fmt.Errorf("failed to decode snapshot: %w", err)
	}

	return b.restoreFromSnapshot(snapshot)
}

// restoreFromSnapshot restores the buffer state from a snapshot.
// It truncates oldest entries if they exceed maxSizeBytes.
func (b *CircularBuffer) restoreFromSnapshot(snapshot Snapshot) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Calculate total size and find entries that fit
	var totalSize int64
	startIdx := 0

	// Calculate size from newest to oldest to determine what fits
	sizes := make([]int, len(snapshot.Entries))
	for i, entry := range snapshot.Entries {
		sizes[i] = entry.EstimateSize()
	}

	// Sum from newest (end) to oldest (start) to find cutoff point
	for i := len(snapshot.Entries) - 1; i >= 0; i-- {
		entrySize := int64(sizes[i])
		if totalSize+entrySize > b.maxSizeBytes {
			startIdx = i + 1
			break
		}
		totalSize += entrySize
	}

	// Number of entries that fit
	entriesToLoad := snapshot.Entries[startIdx:]
	numEntries := len(entriesToLoad)

	if numEntries == 0 {
		return nil // Nothing to restore
	}

	// Ensure capacity
	if numEntries > b.capacity {
		b.entries = make([]models.LogEntry, numEntries)
		b.entrySizes = make([]int, numEntries)
		b.capacity = numEntries
	}

	// Copy entries
	b.currentSize = 0
	for i, entry := range entriesToLoad {
		b.entries[i] = entry
		size := sizes[startIdx+i]
		b.entrySizes[i] = size
		b.currentSize += int64(size)
	}

	b.count = numEntries
	b.tail = 0
	b.head = numEntries % b.capacity

	// Restore ID sequence
	atomic.StoreUint64(&b.idSeq, snapshot.IDSeq)

	return nil
}
