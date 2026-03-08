# Logtail - Agent Guidelines

High-performance log ingestion and visualization application with Go backend and React frontend.

## Project Structure

```
cmd/logtail/          # Application entry point
internal/
  api/                # HTTP handlers, router, middleware (chi router)
  buffer/             # Thread-safe circular buffer
  config/             # CLI flag configuration
  models/             # Domain types (LogEntry, Stats, filters)
  websocket/          # WebSocket hub for real-time streaming
web/
  src/
    components/       # React components (LogTable, FilterPanel, etc.)
    hooks/            # Custom hooks (useLogs, useWebSocket, useStats)
    types/            # TypeScript interfaces and utilities
embed.go              # Go embed for SPA assets
```

## Build & Run Commands

### Backend (Go)

```bash
go build -o logtail ./cmd/logtail           # Build
./logtail                                    # Run (default port 8080)
./logtail -port 9000 -buffer-size 50000     # Custom config

go test ./...                                # All tests
go test ./internal/buffer/...               # Single package
go test -run TestCircularBuffer ./...       # Single test by name
go test -v -race ./...                      # With race detection
go vet ./...                                # Lint
```

### Frontend (web/)

```bash
cd web
npm install                  # Install dependencies
npm run dev                  # Development server (proxies to localhost:8080)
npm run build                # Production build (outputs to web/dist/)
npm run lint                 # Lint
npx tsc --noEmit            # Type check
```

### Full Stack Development

```bash
# Terminal 1: Backend with dev mode
go run ./cmd/logtail -dev

# Terminal 2: Frontend dev server
cd web && npm run dev

# Generate test logs
./scripts/simulate-logs.sh -n 100           # Send 100 logs
./scripts/simulate-logs.sh                  # Continuous mode
```

### Docker

```bash
docker build -t logtail .
docker run -p 8080:8080 logtail
```

## Code Style Guidelines

### Go Backend

**Imports**: Group stdlib, external, internal with blank line separators.

**Naming**:
- Exported: `PascalCase` (e.g., `CircularBuffer`, `LogEntry`)
- Unexported: `camelCase` (e.g., `matchesFilter`, `idSeq`)
- Receivers: short, first letter (e.g., `(b *CircularBuffer)`)
- Constructors: `New<Type>` returns pointer

**Structs**: Use JSON tags with `omitempty` for optional fields.

**Error Handling**:
- Return errors, don't panic
- Use `fmt.Errorf` for context
- HTTP: `http.Error(w, "message", http.StatusBadRequest)`
- Fatal only in main: `log.Fatalf("Server error: %v", err)`

**Concurrency**:
- `sync.RWMutex` for read-heavy data
- `sync/atomic` for counters
- Callbacks in goroutines: `go b.onChange(entry)`

**HTTP Handlers**: Use chi router. Group in struct with dependencies.
Pattern: `func (h *Handlers) HandleX(w http.ResponseWriter, r *http.Request)`

### TypeScript Frontend

**Imports**: React, external libs, internal modules, types.
```typescript
import { useState, useCallback } from 'react';
import { Table, Badge } from '@cloudflare/kumo';
import { useLogs } from '../hooks/useLogs';
import type { LogEntry } from '../types';
```

**Types**: Define in `types/index.ts`. Use `interface` for shapes, `type` for unions.
Props interfaces: `<ComponentName>Props`. Use `import type`.

**Components**: Functional with hooks. Named exports. Props destructured.
Use Kumo-UI: `Surface`, `Badge`, `Button`, `Table`, etc.

**Hooks**: Prefix `use`. Return `{ data, loading, error, refetch }`.
Use `useCallback` for child props, `useMemo` for computations.

**Styling**: Tailwind CSS v4 with Kumo-UI. Use standard classes (avoid arbitrary values).

### Kumo-UI Patterns

```typescript
// Dialog with render prop
<Dialog.Root>
  <Dialog.Trigger render={(props) => <Button {...props}>Open</Button>} />
  <Dialog.Popup>...</Dialog.Popup>
</Dialog.Root>

// Empty state (props, not compound)
<Empty icon={<Icon />} title="No data" description="Try again" />

// Badge variants: primary, secondary, destructive, outline, beta
// Button with shape requires aria-label
<Button shape="square" aria-label="Settings"><Gear /></Button>
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ingest` | Accept gzip-compressed JSONL logs |
| GET | `/api/logs` | Paginated, filterable log queries |
| GET | `/api/stats` | 24-hour histogram and buffer stats |
| GET | `/api/values?field=X` | Unique values for filter dropdowns |
| GET | `/ws` | WebSocket for real-time streaming |
| GET | `/health` | Health check with buffer stats |

## Log Schema

```json
{"client":"string","facility":"string","hostname":"string","priority":0,"severity":0-7,"tag":"string","timestamp":"RFC3339","content":"string"}
```

Severity: 0=emergency, 1=alert, 2=critical, 3=error, 4=warning, 5=notice, 6=info, 7=debug

## Testing Patterns

**Go tests**: Same package with `_test.go` suffix.
```go
func TestCircularBuffer_Add(t *testing.T) {
    buf := buffer.New(100)
    entry := buf.Add(models.LogEntry{...})
    if entry.ID != 1 { t.Errorf("expected ID 1, got %d", entry.ID) }
}
```

**Table-driven tests**:
```go
tests := []struct {
    name     string
    input    int
    expected int
}{
    {"positive", 5, 10},
    {"zero", 0, 0},
}
for _, tt := range tests {
    t.Run(tt.name, func(t *testing.T) { ... })
}
```
