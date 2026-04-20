package models

import (
	"testing"
)

func TestToLogEntry_ClientPortStripping(t *testing.T) {
	tests := []struct {
		name           string
		client         string
		expectedClient string
	}{
		{
			name:           "IPv4 with port",
			client:         "192.168.1.10:54147",
			expectedClient: "192.168.1.10",
		},
		{
			name:           "IPv4 without port",
			client:         "192.168.1.10",
			expectedClient: "192.168.1.10",
		},
		{
			name:           "IPv6 with port",
			client:         "[::1]:54147",
			expectedClient: "::1",
		},
		{
			name:           "IPv6 without port",
			client:         "::1",
			expectedClient: "::1",
		},
		{
			name:           "hostname with port",
			client:         "myhost.example.com:8080",
			expectedClient: "myhost.example.com",
		},
		{
			name:           "hostname without port",
			client:         "myhost.example.com",
			expectedClient: "myhost.example.com",
		},
		{
			name:           "empty client",
			client:         "",
			expectedClient: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload := &IngestPayload{
				Client:   tt.client,
				Severity: 6,
			}
			entry, err := payload.ToLogEntry(1)
			if err != nil {
				t.Fatalf("ToLogEntry returned unexpected error: %v", err)
			}
			if entry.Client != tt.expectedClient {
				t.Errorf("Client = %q, want %q", entry.Client, tt.expectedClient)
			}
		})
	}
}
