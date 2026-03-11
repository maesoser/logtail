package websocket

import (
	"testing"
	"time"
)

func TestHub_NewHub(t *testing.T) {
	hub := NewHub()
	if hub == nil {
		t.Fatal("NewHub returned nil")
	}
	if hub.clients == nil {
		t.Error("clients map not initialized")
	}
	if hub.ClientCount() != 0 {
		t.Errorf("expected 0 clients, got %d", hub.ClientCount())
	}
}

func TestHub_Stop(t *testing.T) {
	hub := NewHub()

	// Start the hub in a goroutine
	go hub.Run()

	// Give it time to start
	time.Sleep(10 * time.Millisecond)

	// Stop should complete without blocking
	done := make(chan struct{})
	go func() {
		hub.Stop()
		close(done)
	}()

	select {
	case <-done:
		// Success - Stop completed
	case <-time.After(1 * time.Second):
		t.Fatal("Hub.Stop() timed out")
	}
}

func TestHub_StopDisconnectsClients(t *testing.T) {
	hub := NewHub()

	// Start the hub
	go hub.Run()
	time.Sleep(10 * time.Millisecond)

	// Manually register a mock client
	client := &Client{
		hub:  hub,
		conn: nil, // We won't use the connection in this test
		send: make(chan []byte, 256),
	}
	hub.register <- client

	// Wait for registration
	time.Sleep(10 * time.Millisecond)

	if hub.ClientCount() != 1 {
		t.Errorf("expected 1 client, got %d", hub.ClientCount())
	}

	// Stop the hub
	hub.Stop()

	// Verify client's send channel is closed
	select {
	case _, ok := <-client.send:
		if ok {
			t.Error("expected client send channel to be closed")
		}
	default:
		// Channel might be empty but closed, try receiving with timeout
		time.Sleep(10 * time.Millisecond)
		select {
		case _, ok := <-client.send:
			if ok {
				t.Error("expected client send channel to be closed")
			}
		default:
			t.Error("client send channel not closed")
		}
	}

	if hub.ClientCount() != 0 {
		t.Errorf("expected 0 clients after stop, got %d", hub.ClientCount())
	}
}
