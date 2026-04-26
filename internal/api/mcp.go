package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/logtail/logtail/internal/models"
)

// MCP JSON-RPC 2.0 types

type mcpRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      interface{}     `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type mcpResponse struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id"`
	Result  interface{} `json:"result,omitempty"`
	Error   *mcpError   `json:"error,omitempty"`
}

type mcpError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Tool input/output schemas

type mcpTool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema interface{} `json:"inputSchema"`
}

type mcpToolsListResult struct {
	Tools []mcpTool `json:"tools"`
}

type mcpInitializeResult struct {
	ProtocolVersion string      `json:"protocolVersion"`
	Capabilities    interface{} `json:"capabilities"`
	ServerInfo      interface{} `json:"serverInfo"`
}

type mcpCallToolParams struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type mcpCallToolResult struct {
	Content []mcpContent `json:"content"`
	IsError bool         `json:"isError,omitempty"`
}

type mcpContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// Tool argument types

type getStatsArgs struct {
	Range string `json:"range"` // "8h", "24h", "5d", "21d"
}

type queryLogsArgs struct {
	Client   []string `json:"client,omitempty"`
	Hostname []string `json:"hostname,omitempty"`
	Tag      []string `json:"tag,omitempty"`
	Content  string   `json:"content,omitempty"`
	Severity []int    `json:"severity,omitempty"`
	From     string   `json:"from,omitempty"`
	To       string   `json:"to,omitempty"`
	Page     int      `json:"page,omitempty"`
	Limit    int      `json:"limit,omitempty"`
}

// MCP error codes
const (
	mcpParseError     = -32700
	mcpInvalidRequest = -32600
	mcpMethodNotFound = -32601
	mcpInvalidParams  = -32602
	mcpInternalError  = -32603
)

func mcpToolList() []mcpTool {
	return []mcpTool{
		{
			Name:        "get_stats",
			Description: "Returns buffer statistics including total entries, size, oldest/newest timestamps, and a histogram of log counts by time bucket broken down by severity.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"range": map[string]interface{}{
						"type":        "string",
						"description": "Time range for the histogram. One of: 8h, 24h, 5d, 21d. Defaults to 24h.",
						"enum":        []string{"8h", "24h", "5d", "21d"},
					},
				},
				"additionalProperties": false,
			},
		},
		{
			Name:        "query_logs",
			Description: "Query log entries with optional filters. Returns paginated results sorted newest-first.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"client": map[string]interface{}{
						"type":        "array",
						"items":       map[string]interface{}{"type": "string"},
						"description": "Filter by client IP(s). OR logic.",
					},
					"hostname": map[string]interface{}{
						"type":        "array",
						"items":       map[string]interface{}{"type": "string"},
						"description": "Filter by hostname(s). OR logic.",
					},
					"tag": map[string]interface{}{
						"type":        "array",
						"items":       map[string]interface{}{"type": "string"},
						"description": "Filter by tag(s). OR logic.",
					},
					"content": map[string]interface{}{
						"type":        "string",
						"description": "Substring filter on log message content (case-insensitive).",
					},
					"severity": map[string]interface{}{
						"type":        "array",
						"items":       map[string]interface{}{"type": "integer", "minimum": 0, "maximum": 7},
						"description": "Filter by severity level(s): 0=emergency, 1=alert, 2=critical, 3=error, 4=warning, 5=notice, 6=info, 7=debug. OR logic.",
					},
					"from": map[string]interface{}{
						"type":        "string",
						"description": "Start time (RFC3339). Only logs at or after this time.",
					},
					"to": map[string]interface{}{
						"type":        "string",
						"description": "End time (RFC3339). Only logs at or before this time.",
					},
					"page": map[string]interface{}{
						"type":        "integer",
						"description": "Page number (1-indexed). Defaults to 1.",
						"minimum":     1,
					},
					"limit": map[string]interface{}{
						"type":        "integer",
						"description": "Results per page. Defaults to 50, max 500.",
						"minimum":     1,
						"maximum":     500,
					},
				},
				"additionalProperties": false,
			},
		},
	}
}

// HandleMCP handles MCP JSON-RPC 2.0 requests over HTTP POST.
func (h *Handlers) HandleMCP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req mcpRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, mcpResponse{
			JSONRPC: "2.0",
			Error:   &mcpError{Code: mcpParseError, Message: "Parse error: " + err.Error()},
		})
		return
	}

	if req.JSONRPC != "2.0" {
		writeJSON(w, mcpResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &mcpError{Code: mcpInvalidRequest, Message: "jsonrpc must be \"2.0\""},
		})
		return
	}

	var result interface{}
	var rpcErr *mcpError

	switch req.Method {
	case "initialize":
		result = mcpInitializeResult{
			ProtocolVersion: "2024-11-05",
			Capabilities: map[string]interface{}{
				"tools": map[string]interface{}{},
			},
			ServerInfo: map[string]interface{}{
				"name":    "logtail",
				"version": "1.0.0",
			},
		}

	case "notifications/initialized":
		// client acknowledgement — no response needed for notifications,
		// but since we're HTTP (not SSE) we just return an empty result.
		result = map[string]interface{}{}

	case "tools/list":
		result = mcpToolsListResult{Tools: mcpToolList()}

	case "tools/call":
		result, rpcErr = h.handleToolCall(req.Params)

	default:
		rpcErr = &mcpError{Code: mcpMethodNotFound, Message: "Method not found: " + req.Method}
	}

	writeJSON(w, mcpResponse{
		JSONRPC: "2.0",
		ID:      req.ID,
		Result:  result,
		Error:   rpcErr,
	})
}

func (h *Handlers) handleToolCall(raw json.RawMessage) (interface{}, *mcpError) {
	var params mcpCallToolParams
	if err := json.Unmarshal(raw, &params); err != nil {
		return nil, &mcpError{Code: mcpInvalidParams, Message: "Invalid params: " + err.Error()}
	}

	switch params.Name {
	case "get_stats":
		return h.mcpGetStats(params.Arguments)
	case "query_logs":
		return h.mcpQueryLogs(params.Arguments)
	default:
		return nil, &mcpError{Code: mcpInvalidParams, Message: "Unknown tool: " + params.Name}
	}
}

func (h *Handlers) mcpGetStats(raw json.RawMessage) (interface{}, *mcpError) {
	var args getStatsArgs
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &args); err != nil {
			return nil, &mcpError{Code: mcpInvalidParams, Message: "Invalid arguments: " + err.Error()}
		}
	}

	histConfig := models.HistogramConfig24h
	switch strings.ToLower(args.Range) {
	case "8h":
		histConfig = models.HistogramConfig8h
	case "5d":
		histConfig = models.HistogramConfig5d
	case "21d":
		histConfig = models.HistogramConfig21d
	}

	stats := h.Buffer.GetStats(nil, histConfig)

	text, err := json.MarshalIndent(stats, "", "  ")
	if err != nil {
		return nil, &mcpError{Code: mcpInternalError, Message: "Failed to serialize stats"}
	}

	return mcpCallToolResult{
		Content: []mcpContent{{Type: "text", Text: string(text)}},
	}, nil
}

func (h *Handlers) mcpQueryLogs(raw json.RawMessage) (interface{}, *mcpError) {
	var args queryLogsArgs
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &args); err != nil {
			return nil, &mcpError{Code: mcpInvalidParams, Message: "Invalid arguments: " + err.Error()}
		}
	}

	filter := models.LogFilter{
		Client:   args.Client,
		Hostname: args.Hostname,
		Tag:      args.Tag,
		Content:  args.Content,
		Severity: args.Severity,
		Page:     args.Page,
		Limit:    args.Limit,
	}

	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.Limit < 1 {
		filter.Limit = 50
	}
	if filter.Limit > 500 {
		filter.Limit = 500
	}

	if args.From != "" {
		t, err := time.Parse(time.RFC3339, args.From)
		if err != nil {
			t, err = time.Parse(time.RFC3339Nano, args.From)
			if err != nil {
				return nil, &mcpError{Code: mcpInvalidParams, Message: "Invalid 'from' timestamp: " + err.Error()}
			}
		}
		filter.From = &t
	}
	if args.To != "" {
		t, err := time.Parse(time.RFC3339, args.To)
		if err != nil {
			t, err = time.Parse(time.RFC3339Nano, args.To)
			if err != nil {
				return nil, &mcpError{Code: mcpInvalidParams, Message: "Invalid 'to' timestamp: " + err.Error()}
			}
		}
		filter.To = &t
	}

	result := h.Buffer.Query(filter)

	text, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return nil, &mcpError{Code: mcpInternalError, Message: "Failed to serialize query result"}
	}

	return mcpCallToolResult{
		Content: []mcpContent{{Type: "text", Text: string(text)}},
	}, nil
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}
