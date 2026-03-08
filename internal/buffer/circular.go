package buffer

import (
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/webtail/webtail/internal/models"
)

const (
	// DefaultMaxSizeBytes is the default maximum buffer size (100 MB)
	DefaultMaxSizeBytes = 100 * 1024 * 1024
	// DefaultReorderWindow is the default time window for reordering out-of-order logs
	DefaultReorderWindow = 1 * time.Hour
)

// CircularBuffer is a thread-safe circular buffer for storing log entries
// limited by total memory usage in bytes.
type CircularBuffer struct {
	entries       []models.LogEntry
	entrySizes    []int // Size of each entry for quick eviction calculation
	maxSizeBytes  int64 // Maximum total size in bytes
	currentSize   int64 // Current total size in bytes
	count         int
	head          int // Points to the next write position
	tail          int // Points to the oldest entry
	capacity      int // Current slice capacity
	mu            sync.RWMutex
	idSeq         uint64
	onChange      func(entry models.LogEntry) // Callback for new entries
	reorderWindow time.Duration               // Time window for reordering out-of-order logs
}

// New creates a new circular buffer with the specified maximum size in bytes.
// If maxSizeBytes is <= 0, it defaults to 100 MB.
func New(maxSizeBytes int64) *CircularBuffer {
	return NewWithReorderWindow(maxSizeBytes, DefaultReorderWindow)
}

// NewWithReorderWindow creates a new circular buffer with custom reorder window.
// The reorder window determines how far back in time we look when inserting
// out-of-order log entries. Logs within this window will be inserted in
// timestamp-sorted order; logs older than the window are appended at the end.
func NewWithReorderWindow(maxSizeBytes int64, reorderWindow time.Duration) *CircularBuffer {
	if maxSizeBytes <= 0 {
		maxSizeBytes = DefaultMaxSizeBytes
	}
	if reorderWindow < 0 {
		reorderWindow = DefaultReorderWindow
	}
	// Start with a reasonable initial capacity
	initialCapacity := 10000
	return &CircularBuffer{
		entries:       make([]models.LogEntry, initialCapacity),
		entrySizes:    make([]int, initialCapacity),
		maxSizeBytes:  maxSizeBytes,
		currentSize:   0,
		capacity:      initialCapacity,
		count:         0,
		head:          0,
		tail:          0,
		reorderWindow: reorderWindow,
	}
}

// SetOnChange sets a callback function that is called when a new entry is added
func (b *CircularBuffer) SetOnChange(fn func(entry models.LogEntry)) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.onChange = fn
}

// Add adds a new log entry to the buffer, inserting it in timestamp order
// within the reorder window. Entries newer than the newest entry or older
// than the reorder window are appended at the end.
func (b *CircularBuffer) Add(entry models.LogEntry) models.LogEntry {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Assign a unique ID
	entry.ID = atomic.AddUint64(&b.idSeq, 1)

	// Calculate entry size
	entrySize := entry.EstimateSize()

	// Evict oldest entries until we have room for the new one
	for b.count > 0 && b.currentSize+int64(entrySize) > b.maxSizeBytes {
		b.evictOldest()
	}

	// Grow capacity if needed
	if b.count >= b.capacity {
		b.grow()
	}

	// Find the correct insertion position based on timestamp
	insertPos := b.findInsertPosition(entry.Timestamp)

	// Insert at the calculated position
	b.insertAt(insertPos, entry, entrySize)

	// Call onChange callback if set
	if b.onChange != nil {
		// Call in a goroutine to avoid blocking
		go b.onChange(entry)
	}

	return entry
}

// evictOldest removes the oldest entry from the buffer (must be called with lock held)
func (b *CircularBuffer) evictOldest() {
	if b.count == 0 {
		return
	}
	// Subtract the size of the oldest entry
	b.currentSize -= int64(b.entrySizes[b.tail])
	// Clear the entry to help GC
	b.entries[b.tail] = models.LogEntry{}
	b.entrySizes[b.tail] = 0
	// Move tail forward
	b.tail = (b.tail + 1) % b.capacity
	b.count--
}

// grow doubles the capacity of the buffer (must be called with lock held)
func (b *CircularBuffer) grow() {
	newCapacity := b.capacity * 2
	newEntries := make([]models.LogEntry, newCapacity)
	newSizes := make([]int, newCapacity)

	// Copy entries in order from tail to head
	for i := 0; i < b.count; i++ {
		oldIdx := (b.tail + i) % b.capacity
		newEntries[i] = b.entries[oldIdx]
		newSizes[i] = b.entrySizes[oldIdx]
	}

	b.entries = newEntries
	b.entrySizes = newSizes
	b.tail = 0
	b.head = b.count
	b.capacity = newCapacity
}

// findInsertPosition finds the correct position to insert an entry based on timestamp.
// It searches within the reorder window using binary search and returns the logical
// index (0 = oldest, count-1 = newest) where the entry should be inserted.
// Returns count if the entry should be appended at the end (newest position).
// Must be called with lock held.
func (b *CircularBuffer) findInsertPosition(timestamp time.Time) int {
	if b.count == 0 {
		return 0
	}

	// Get the timestamp of the newest entry
	newestIdx := (b.head - 1 + b.capacity) % b.capacity
	newestTimestamp := b.entries[newestIdx].Timestamp

	// If the new entry is newer or equal to the newest, append at the end
	if !timestamp.Before(newestTimestamp) {
		return b.count
	}

	// Calculate the cutoff time for the reorder window
	windowCutoff := time.Now().Add(-b.reorderWindow)

	// If the entry is older than the reorder window, append at the end
	// (we don't reorder very old entries)
	if timestamp.Before(windowCutoff) {
		return b.count
	}

	// Binary search within recent entries to find the correct position
	// We search from the end (newest) backwards within the window
	low := 0
	high := b.count

	// First, find where the window starts (skip entries older than window)
	for low < high {
		mid := (low + high) / 2
		midIdx := (b.tail + mid) % b.capacity
		if b.entries[midIdx].Timestamp.Before(windowCutoff) {
			low = mid + 1
		} else {
			high = mid
		}
	}
	windowStart := low

	// Now binary search within the window for the correct position
	low = windowStart
	high = b.count

	for low < high {
		mid := (low + high) / 2
		midIdx := (b.tail + mid) % b.capacity
		if b.entries[midIdx].Timestamp.Before(timestamp) {
			low = mid + 1
		} else {
			high = mid
		}
	}

	return low
}

// insertAt inserts an entry at the specified logical position, shifting newer entries.
// Position is a logical index where 0 = oldest, count = after newest.
// Must be called with lock held and after ensuring capacity.
func (b *CircularBuffer) insertAt(pos int, entry models.LogEntry, entrySize int) {
	if pos >= b.count {
		// Append at the end (most common case)
		b.entries[b.head] = entry
		b.entrySizes[b.head] = entrySize
		b.head = (b.head + 1) % b.capacity
	} else {
		// Need to shift entries from pos to head-1 to make room
		// Shift right by one position
		for i := b.count - 1; i >= pos; i-- {
			srcIdx := (b.tail + i) % b.capacity
			dstIdx := (b.tail + i + 1) % b.capacity
			b.entries[dstIdx] = b.entries[srcIdx]
			b.entrySizes[dstIdx] = b.entrySizes[srcIdx]
		}
		// Insert at the position
		insertIdx := (b.tail + pos) % b.capacity
		b.entries[insertIdx] = entry
		b.entrySizes[insertIdx] = entrySize
		b.head = (b.head + 1) % b.capacity
	}
	b.count++
	b.currentSize += int64(entrySize)
}

// AddBatch adds multiple log entries to the buffer
func (b *CircularBuffer) AddBatch(entries []models.LogEntry) []models.LogEntry {
	result := make([]models.LogEntry, len(entries))
	for i, entry := range entries {
		result[i] = b.Add(entry)
	}
	return result
}

// Query returns log entries matching the filter criteria
func (b *CircularBuffer) Query(filter models.LogFilter) models.LogQueryResult {
	b.mu.RLock()
	defer b.mu.RUnlock()

	// Set defaults
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Page <= 0 {
		filter.Page = 1
	}

	// Collect all matching entries (newest first)
	var matched []models.LogEntry
	for i := 0; i < b.count; i++ {
		// Read from newest to oldest
		idx := (b.head - 1 - i + b.capacity) % b.capacity
		entry := b.entries[idx]

		if b.matchesFilter(entry, filter) {
			matched = append(matched, entry)
		}
	}

	totalCount := len(matched)
	totalPages := (totalCount + filter.Limit - 1) / filter.Limit
	if totalPages == 0 {
		totalPages = 1
	}

	// Calculate pagination
	startIdx := (filter.Page - 1) * filter.Limit
	endIdx := startIdx + filter.Limit
	if startIdx > len(matched) {
		startIdx = len(matched)
	}
	if endIdx > len(matched) {
		endIdx = len(matched)
	}

	result := models.LogQueryResult{
		Entries:    matched[startIdx:endIdx],
		TotalCount: totalCount,
		Page:       filter.Page,
		Limit:      filter.Limit,
		TotalPages: totalPages,
	}

	// Ensure Entries is never nil
	if result.Entries == nil {
		result.Entries = []models.LogEntry{}
	}

	return result
}

// matchesFilter checks if an entry matches the given filter
func (b *CircularBuffer) matchesFilter(entry models.LogEntry, filter models.LogFilter) bool {
	// Filter by client (OR logic - match any of the specified clients)
	if len(filter.Client) > 0 {
		found := false
		for _, c := range filter.Client {
			if strings.EqualFold(entry.Client, c) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Filter by hostname (OR logic - match any of the specified hostnames)
	if len(filter.Hostname) > 0 {
		found := false
		for _, h := range filter.Hostname {
			if strings.EqualFold(entry.Hostname, h) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Filter by tag (OR logic - match any of the specified tags)
	if len(filter.Tag) > 0 {
		found := false
		for _, t := range filter.Tag {
			if strings.EqualFold(entry.Tag, t) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Filter by content (substring, case-insensitive)
	if filter.Content != "" && !strings.Contains(strings.ToLower(entry.Content), strings.ToLower(filter.Content)) {
		return false
	}

	// Filter by severity levels (OR logic - match any of the specified levels)
	if len(filter.Severity) > 0 {
		found := false
		for _, s := range filter.Severity {
			if entry.Severity == s {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Filter by time range
	if filter.From != nil && entry.Timestamp.Before(*filter.From) {
		return false
	}
	if filter.To != nil && entry.Timestamp.After(*filter.To) {
		return false
	}

	return true
}

// severityBucket holds count and severity breakdown for a histogram bucket
type severityBucket struct {
	count      int
	bySeverity [8]int // counts for severity levels 0-7
}

// GetStats returns buffer statistics including histogram data
// If filter is provided, the histogram will only include entries matching
// all filter criteria (client, hostname, tag, content, severity, time range)
func (b *CircularBuffer) GetStats(filter *models.LogFilter) models.Stats {
	b.mu.RLock()
	defer b.mu.RUnlock()

	// 96 buckets of 15 minutes each = 24 hours total
	const numBuckets = 96
	const bucketMinutes = 15

	stats := models.Stats{
		TotalEntries:    b.count,
		BufferSizeBytes: b.maxSizeBytes,
		UsedSizeBytes:   b.currentSize,
		Histogram:       make([]models.HistogramBucket, numBuckets),
	}

	// Initialize histogram buckets for the last 24 hours (15-min intervals)
	now := time.Now().UTC()
	intervalBuckets := make(map[int]*severityBucket) // interval offset -> bucket data

	// Find oldest and newest timestamps and build histogram
	var oldest, newest *time.Time

	// Check if we have any filter criteria
	hasFilter := filter != nil && (len(filter.Client) > 0 || len(filter.Hostname) > 0 ||
		len(filter.Tag) > 0 || filter.Content != "" || len(filter.Severity) > 0 ||
		filter.From != nil || filter.To != nil)

	for i := 0; i < b.count; i++ {
		idx := (b.tail + i) % b.capacity
		entry := b.entries[idx]

		// Track oldest and newest (for all entries, not filtered)
		if oldest == nil || entry.Timestamp.Before(*oldest) {
			ts := entry.Timestamp
			oldest = &ts
		}
		if newest == nil || entry.Timestamp.After(*newest) {
			ts := entry.Timestamp
			newest = &ts
		}

		// Apply full filter matching if filter is provided
		if hasFilter && !b.matchesFilter(entry, *filter) {
			continue
		}

		// Calculate 15-minute intervals ago (for histogram)
		minutesAgo := int(now.Sub(entry.Timestamp).Minutes())
		intervalsAgo := minutesAgo / bucketMinutes
		if intervalsAgo >= 0 && intervalsAgo < numBuckets {
			if intervalBuckets[intervalsAgo] == nil {
				intervalBuckets[intervalsAgo] = &severityBucket{}
			}
			intervalBuckets[intervalsAgo].count++
			// Track severity (ensure it's in valid range 0-7)
			if entry.Severity >= 0 && entry.Severity <= 7 {
				intervalBuckets[intervalsAgo].bySeverity[entry.Severity]++
			}
		}
	}

	stats.OldestTimestamp = oldest
	stats.NewestTimestamp = newest

	// Build histogram array (index 0 = current interval, index 95 = oldest interval)
	for i := 0; i < numBuckets; i++ {
		intervalTime := now.Add(-time.Duration(i*bucketMinutes) * time.Minute)
		bucket := intervalBuckets[i]
		histBucket := models.HistogramBucket{
			Hour: intervalTime.Format("15:04"),
		}
		if bucket != nil {
			histBucket.Count = bucket.count
			histBucket.BySeverity = models.SeverityCounts{
				Emergency: bucket.bySeverity[0],
				Alert:     bucket.bySeverity[1],
				Critical:  bucket.bySeverity[2],
				Error:     bucket.bySeverity[3],
				Warning:   bucket.bySeverity[4],
				Notice:    bucket.bySeverity[5],
				Info:      bucket.bySeverity[6],
				Debug:     bucket.bySeverity[7],
			}
		}
		stats.Histogram[i] = histBucket
	}

	// Reverse so oldest is first (for display purposes)
	for i, j := 0, len(stats.Histogram)-1; i < j; i, j = i+1, j-1 {
		stats.Histogram[i], stats.Histogram[j] = stats.Histogram[j], stats.Histogram[i]
	}

	return stats
}

// MaxSizeBytes returns the configured maximum buffer size in bytes
func (b *CircularBuffer) MaxSizeBytes() int64 {
	return b.maxSizeBytes
}

// CurrentSizeBytes returns the current buffer usage in bytes
func (b *CircularBuffer) CurrentSizeBytes() int64 {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.currentSize
}

// Count returns the current number of entries in the buffer
func (b *CircularBuffer) Count() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.count
}

// Clear removes all entries from the buffer
func (b *CircularBuffer) Clear() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.entries = make([]models.LogEntry, b.capacity)
	b.entrySizes = make([]int, b.capacity)
	b.currentSize = 0
	b.count = 0
	b.head = 0
	b.tail = 0
}

// GetUniqueValues returns unique values for a specific field (for filter dropdowns)
func (b *CircularBuffer) GetUniqueValues(field string) []string {
	b.mu.RLock()
	defer b.mu.RUnlock()

	seen := make(map[string]bool)
	var values []string

	for i := 0; i < b.count; i++ {
		idx := (b.tail + i) % b.capacity
		entry := b.entries[idx]

		var value string
		switch field {
		case "client":
			value = entry.Client
		case "hostname":
			value = entry.Hostname
		case "tag":
			value = entry.Tag
		case "facility":
			value = fmt.Sprintf("%d", entry.Facility)
		default:
			continue
		}

		if value != "" && !seen[value] {
			seen[value] = true
			values = append(values, value)
		}
	}

	return values
}
