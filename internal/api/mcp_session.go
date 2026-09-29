package api

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"
)

const (
	// sessionTTL is how long a session lives with no activity before being reaped.
	sessionTTL = 5 * time.Minute
	// sessionSendBuffer is the number of outbound SSE messages that can be buffered
	// before the message is dropped.
	sessionSendBuffer = 64
)

// mcpSession represents an active SSE client connection.
type mcpSession struct {
	id       string
	ch       chan string  // outbound SSE event payloads (JSON strings)
	done     chan struct{} // closed when the session is terminated
	lastSeen atomic.Int64 // Unix nanoseconds, updated atomically to avoid data races
}

// send enqueues a JSON payload to be written to the SSE stream.
// Returns false if the session is gone or the channel is full (message dropped).
// Uses a non-blocking send so it never stalls the calling HTTP handler goroutine.
func (s *mcpSession) send(payload string) bool {
	select {
	case <-s.done:
		return false
	case s.ch <- payload:
		s.lastSeen.Store(time.Now().UnixNano())
		return true
	default:
		// Channel full — drop the message rather than blocking the handler goroutine.
		log.Printf("mcp: session %s channel full, dropping message", s.id)
		return false
	}
}

// close signals the SSE handler goroutine to terminate.
func (s *mcpSession) close() {
	select {
	case <-s.done:
	default:
		close(s.done)
	}
}

// mcpSessionManager holds all live SSE sessions and reaps stale ones.
type mcpSessionManager struct {
	mu       sync.RWMutex
	sessions map[string]*mcpSession
}

func newSessionManager() *mcpSessionManager {
	m := &mcpSessionManager{
		sessions: make(map[string]*mcpSession),
	}
	go m.reaper()
	return m
}

// create allocates a new session and registers it.
// Returns an error if a cryptographically secure session ID cannot be generated.
func (m *mcpSessionManager) create() (*mcpSession, error) {
	id, err := newSessionID()
	if err != nil {
		return nil, err
	}
	s := &mcpSession{
		id:   id,
		ch:   make(chan string, sessionSendBuffer),
		done: make(chan struct{}),
	}
	s.lastSeen.Store(time.Now().UnixNano())
	m.mu.Lock()
	m.sessions[id] = s
	m.mu.Unlock()
	return s, nil
}

// get returns the session for id, or nil if not found.
func (m *mcpSessionManager) get(id string) *mcpSession {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[id]
}

// remove deletes and closes the session.
func (m *mcpSessionManager) remove(id string) {
	m.mu.Lock()
	s, ok := m.sessions[id]
	if ok {
		delete(m.sessions, id)
	}
	m.mu.Unlock()
	if ok {
		s.close()
	}
}

// reaper periodically evicts sessions whose SSE connection has already dropped
// (done is closed) or that have been idle longer than sessionTTL.
func (m *mcpSessionManager) reaper() {
	tick := time.NewTicker(sessionTTL / 2)
	defer tick.Stop()
	for range tick.C {
		now := time.Now().UnixNano()
		ttlNanos := sessionTTL.Nanoseconds()
		m.mu.Lock()
		for id, s := range m.sessions {
			select {
			case <-s.done:
				delete(m.sessions, id)
			default:
				if now-s.lastSeen.Load() > ttlNanos {
					delete(m.sessions, id)
					s.close()
				}
			}
		}
		m.mu.Unlock()
	}
}

// newSessionID returns a 128-bit cryptographically random hex string.
func newSessionID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("mcp: failed to generate session ID: %w", err)
	}
	return hex.EncodeToString(b), nil
}
