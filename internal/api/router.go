package api

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/webtail/webtail/internal/buffer"
	"github.com/webtail/webtail/internal/models"
	"github.com/webtail/webtail/internal/websocket"
)

// NewRouter creates and configures the chi router
func NewRouter(buf *buffer.CircularBuffer, hub *websocket.Hub, webAssets embed.FS, devMode bool, settings *models.SettingsStore) *chi.Mux {
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(RecoveryMiddleware)
	r.Use(LoggingMiddleware)

	// CORS configuration
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:*", "http://127.0.0.1:*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "Content-Encoding"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Create handlers
	handlers := NewHandlers(buf, hub, settings)

	// Setup WebSocket broadcasting
	handlers.SetupWebSocketBroadcast()

	// API routes
	r.Route("/api", func(r chi.Router) {
		r.Get("/logs", handlers.HandleGetLogs)
		r.Get("/stats", handlers.HandleGetStats)
		r.Get("/values", handlers.HandleGetUniqueValues)
		r.Get("/settings", handlers.HandleGetSettings)
		r.Put("/settings", handlers.HandleUpdateSettings)
	})

	// Ingest endpoint
	r.Post("/ingest", handlers.HandleIngest)

	// WebSocket endpoint
	r.Get("/ws", handlers.HandleWebSocket)

	// Health endpoint
	r.Get("/health", handlers.HandleHealth)

	// Serve static files
	if devMode {
		// In dev mode, serve from filesystem
		workDir, _ := os.Getwd()
		filesDir := filepath.Join(workDir, "web", "dist")
		r.Get("/*", spaHandler(http.Dir(filesDir)))
	} else {
		// In production, serve from embedded filesystem
		subFS, err := fs.Sub(webAssets, "web/dist")
		if err != nil {
			// If web/dist doesn't exist, create a simple handler
			r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "text/html")
				w.Write([]byte(`<!DOCTYPE html>
<html>
<head><title>Webtail</title></head>
<body>
<h1>Webtail</h1>
<p>Frontend assets not found. Please build the frontend first.</p>
<p>Run: <code>cd web && npm install && npm run build</code></p>
</body>
</html>`))
			})
		} else {
			r.Get("/*", spaHandler(http.FS(subFS)))
		}
	}

	return r
}

// spaHandler serves static files and falls back to index.html for SPA routing
func spaHandler(staticFS http.FileSystem) http.HandlerFunc {
	fileServer := http.FileServer(staticFS)

	return func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Check if file exists
		f, err := staticFS.Open(path)
		if err != nil {
			// For API routes or websocket, don't serve index.html
			if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/ws") || strings.HasPrefix(path, "/ingest") || strings.HasPrefix(path, "/health") {
				http.NotFound(w, r)
				return
			}
			// Serve index.html for SPA routing
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
			return
		}
		f.Close()

		// Serve the actual file
		fileServer.ServeHTTP(w, r)
	}
}
