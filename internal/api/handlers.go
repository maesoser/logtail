package api

import (
	"bufio"
	"compress/gzip"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/webtail/webtail/internal/buffer"
	"github.com/webtail/webtail/internal/models"
	"github.com/webtail/webtail/internal/websocket"
)

// Handlers contains all HTTP handler functions
type Handlers struct {
	Buffer *buffer.CircularBuffer
	Hub    *websocket.Hub
	Config *models.ConfigStore
}

// NewHandlers creates a new Handlers instance
func NewHandlers(buf *buffer.CircularBuffer, hub *websocket.Hub, config *models.ConfigStore) *Handlers {
	return &Handlers{
		Buffer: buf,
		Hub:    hub,
		Config: config,
	}
}

// IngestResponse represents the response from the ingest endpoint
type IngestResponse struct {
	Ingested int      `json:"ingested"`
	Errors   []string `json:"errors,omitempty"`
}

// IngestResponseExtended represents the response from the ingest endpoint with exclusion info
type IngestResponseExtended struct {
	Ingested int      `json:"ingested"`
	Excluded int      `json:"excluded,omitempty"`
	Errors   []string `json:"errors,omitempty"`
}

// HandleIngest handles POST /ingest for gzip-compressed JSONL payloads
func (h *Handlers) HandleIngest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		log.Println("Invalid method for /ingest:", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check authorization if token is configured
	ingestToken := h.Config.GetIngestToken()
	if ingestToken != "" {
		authHeader := r.Header.Get("Authorization")
		if authHeader != ingestToken {
			log.Println("Unauthorized ingest request: invalid or missing Authorization header")
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
	}

	// Get exclusion patterns
	exclusionPatterns := h.Config.GetExclusionPatterns()

	var reader io.Reader = r.Body

	// Check if content is gzip-compressed
	if r.Header.Get("Content-Encoding") == "gzip" {
		gzReader, err := gzip.NewReader(r.Body)
		if err != nil {
			log.Printf("Failed to create gzip reader: %v", err)
			http.Error(w, "Failed to decompress gzip payload", http.StatusBadRequest)
			return
		}
		defer gzReader.Close()
		reader = gzReader
	}

	// Parse JSONL (JSON Lines)
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024) // 1MB buffer

	var ingested int
	var excluded int
	var errors []string

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var payload models.IngestPayload
		if err := json.Unmarshal(line, &payload); err != nil {
			log.Printf("Failed to unmarshal JSON line: %v", err)
			errors = append(errors, "Invalid JSON: "+err.Error())
			continue
		}

		entry, err := payload.ToLogEntry(0) // ID will be assigned by buffer
		if err != nil {
			log.Printf("Validation error for log entry: %v", err)
			errors = append(errors, "Validation error: "+err.Error())
			continue
		}

		// Check exclusion patterns
		if shouldExclude(entry.Content, exclusionPatterns) {
			excluded++
			continue
		}

		h.Buffer.Add(*entry)
		ingested++
	}

	if err := scanner.Err(); err != nil {
		log.Printf("Scanner error: %v", err)
		errors = append(errors, "Scanner error: "+err.Error())
	}

	response := IngestResponseExtended{
		Ingested: ingested,
		Excluded: excluded,
		Errors:   errors,
	}

	w.Header().Set("Content-Type", "application/json")
	if len(errors) > 0 && ingested == 0 {
		w.WriteHeader(http.StatusBadRequest)
	} else if len(errors) > 0 {
		w.WriteHeader(http.StatusPartialContent)
	} else {
		w.WriteHeader(http.StatusOK)
	}
	json.NewEncoder(w).Encode(response)
}

// shouldExclude checks if content contains any of the exclusion patterns
func shouldExclude(content string, patterns []string) bool {
	if len(patterns) == 0 {
		return false
	}
	contentLower := strings.ToLower(content)
	for _, pattern := range patterns {
		if pattern != "" && strings.Contains(contentLower, strings.ToLower(pattern)) {
			return true
		}
	}
	return false
}

// HandleGetLogs handles GET /api/logs with filtering and pagination
func (h *Handlers) HandleGetLogs(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	filter := models.LogFilter{
		Client:   query.Get("client"),
		Hostname: query.Get("hostname"),
		Tag:      query.Get("tag"),
		Content:  query.Get("content"),
	}

	// Parse severity filter (comma-separated list of levels 0-7)
	if severityStr := query.Get("severity"); severityStr != "" {
		severities := []int{}
		for _, s := range query["severity"] {
			if level, err := strconv.Atoi(s); err == nil && level >= 0 && level <= 7 {
				severities = append(severities, level)
			}
		}
		if len(severities) > 0 {
			filter.Severity = severities
		}
	}

	// Parse pagination
	if pageStr := query.Get("page"); pageStr != "" {
		if page, err := strconv.Atoi(pageStr); err == nil && page > 0 {
			filter.Page = page
		}
	}
	if filter.Page == 0 {
		filter.Page = 1
	}

	if limitStr := query.Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 && limit <= 500 {
			filter.Limit = limit
		}
	}
	if filter.Limit == 0 {
		filter.Limit = 50
	}

	// Parse time range
	if fromStr := query.Get("from"); fromStr != "" {
		if from, err := time.Parse(time.RFC3339, fromStr); err == nil {
			filter.From = &from
		}
	}
	if toStr := query.Get("to"); toStr != "" {
		if to, err := time.Parse(time.RFC3339, toStr); err == nil {
			filter.To = &to
		}
	}

	result := h.Buffer.Query(filter)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// HandleGetStats handles GET /api/stats
func (h *Handlers) HandleGetStats(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	// Parse optional severity filter for histogram filtering
	var filter *models.LogFilter
	if severityStr := query.Get("severity"); severityStr != "" {
		severities := []int{}
		for _, s := range query["severity"] {
			if level, err := strconv.Atoi(s); err == nil && level >= 0 && level <= 7 {
				severities = append(severities, level)
			}
		}
		if len(severities) > 0 {
			filter = &models.LogFilter{Severity: severities}
		}
	}

	stats := h.Buffer.GetStats(filter)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// HandleGetUniqueValues handles GET /api/values/{field}
func (h *Handlers) HandleGetUniqueValues(w http.ResponseWriter, r *http.Request) {
	field := r.URL.Query().Get("field")
	if field == "" {
		http.Error(w, "field parameter is required", http.StatusBadRequest)
		return
	}

	values := h.Buffer.GetUniqueValues(field)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string][]string{"values": values})
}

// HandleWebSocket handles WebSocket connections
func (h *Handlers) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	h.Hub.ServeWS(w, r)
}

// HandleHealth handles GET /health
func (h *Handlers) HandleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":          "healthy",
		"bufferCount":     h.Buffer.Count(),
		"bufferSizeBytes": h.Buffer.MaxSizeBytes(),
		"bufferUsedBytes": h.Buffer.CurrentSizeBytes(),
		"wsClients":       h.Hub.ClientCount(),
	})
}

// SetupWebSocketBroadcast configures the buffer to broadcast new entries via WebSocket
func (h *Handlers) SetupWebSocketBroadcast() {
	h.Buffer.SetOnChange(func(entry models.LogEntry) {
		h.Hub.BroadcastLogEntry(entry)
		log.Printf("Broadcasted log entry ID=%d to %d clients", entry.ID, h.Hub.ClientCount())
	})
}

// ConfigResponse represents the configuration returned to the frontend
// Note: We don't expose the actual token value for security, just whether it's set
type ConfigResponse struct {
	Server struct {
		Port int `json:"port"`
	} `json:"server"`
	Ingest struct {
		HasAuthToken      bool     `json:"hasAuthToken"`
		ExclusionPatterns []string `json:"exclusionPatterns"`
	} `json:"ingest"`
	Buffer struct {
		SizeMB int `json:"sizeMB"`
	} `json:"buffer"`
	ConfigFile string `json:"configFile"`
}

// ConfigUpdateRequest represents a configuration update request from the frontend
type ConfigUpdateRequest struct {
	Server *struct {
		Port *int `json:"port,omitempty"`
	} `json:"server,omitempty"`
	Ingest *struct {
		AuthToken         *string  `json:"authToken,omitempty"`
		ExclusionPatterns []string `json:"exclusionPatterns,omitempty"`
	} `json:"ingest,omitempty"`
	Buffer *struct {
		SizeMB *int `json:"sizeMB,omitempty"`
	} `json:"buffer,omitempty"`
}

// HandleGetConfig handles GET /api/config
func (h *Handlers) HandleGetConfig(w http.ResponseWriter, r *http.Request) {
	config := h.Config.Get()

	response := ConfigResponse{
		ConfigFile: h.Config.GetFilePath(),
	}
	response.Server.Port = config.Server.Port
	response.Ingest.HasAuthToken = config.Ingest.AuthToken != ""
	response.Ingest.ExclusionPatterns = config.Ingest.ExclusionPatterns
	response.Buffer.SizeMB = config.Buffer.SizeMB

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleUpdateConfig handles PUT /api/config
func (h *Handlers) HandleUpdateConfig(w http.ResponseWriter, r *http.Request) {
	var req ConfigUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get current config
	current := h.Config.Get()

	// Update only the fields that were provided
	if req.Server != nil && req.Server.Port != nil {
		current.Server.Port = *req.Server.Port
	}
	if req.Ingest != nil {
		if req.Ingest.AuthToken != nil {
			current.Ingest.AuthToken = *req.Ingest.AuthToken
		}
		if req.Ingest.ExclusionPatterns != nil {
			current.Ingest.ExclusionPatterns = req.Ingest.ExclusionPatterns
		}
	}
	if req.Buffer != nil && req.Buffer.SizeMB != nil {
		current.Buffer.SizeMB = *req.Buffer.SizeMB
	}

	// Save updated config
	if err := h.Config.Update(current); err != nil {
		log.Printf("Failed to update config: %v", err)
		http.Error(w, "Failed to save config: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Return updated config (without exposing token)
	response := ConfigResponse{
		ConfigFile: h.Config.GetFilePath(),
	}
	response.Server.Port = current.Server.Port
	response.Ingest.HasAuthToken = current.Ingest.AuthToken != ""
	response.Ingest.ExclusionPatterns = current.Ingest.ExclusionPatterns
	response.Buffer.SizeMB = current.Buffer.SizeMB

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
