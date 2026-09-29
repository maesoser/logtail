# Logtail REST API Reference

The two endpoints below provide the same data as the MCP `get_stats` and `query_logs` tools.

---

## `GET /api/stats`

Returns buffer statistics and a histogram of log counts per time bucket, broken down by severity.

### Query parameters

| Parameter | Type | Repeatable | Default | Description |
|---|---|---|---|---|
| `range` | `string` | No | `24h` | Histogram window. One of: `8h`, `24h`, `5d`, `21d`. Any other value falls back to `24h`. |
| `from` | `string` | No | — | Inclusive start time (RFC3339). Returns `400` if malformed. |
| `to` | `string` | No | — | Inclusive end time (RFC3339). Returns `400` if malformed. |
| `client` | `string` | Yes | — | Filter by client IP. Repeat for multiple values (OR logic). |
| `hostname` | `string` | Yes | — | Filter by hostname. Repeat for multiple values (OR logic). |
| `tag` | `string` | Yes | — | Filter by syslog tag. Repeat for multiple values (OR logic). |
| `content` | `string` | No | — | Case-insensitive substring match on log message content. |
| `severity` | `integer` | Yes | — | Filter by severity level `0`–`7`. Repeat for multiple values (OR logic). Out-of-range values are silently ignored. |

`from`/`to` and the filter params narrow which entries contribute to the histogram counts.
`range` controls only the bucket grid (window size and granularity).

**`range` histogram configurations:**

| `range` | Window | Bucket width | Buckets | Label format |
|---|---|---|---|---|
| `8h` | 8 hours | 5 min | 96 | `15:04` |
| `24h` | 24 hours | 10 min | 144 | `15:04` |
| `5d` | 5 days | 60 min | 120 | `01/02 15:04` |
| `21d` | 21 days | 180 min | 168 | `01/02 15:04` |

### Response

```json
{
  "totalEntries": 1500,
  "bufferSizeBytes": 104857600,
  "usedSizeBytes": 2345678,
  "oldestTimestamp": "2026-08-24T10:00:00Z",
  "newestTimestamp": "2026-08-25T09:59:00Z",
  "bucketMinutes": 10,
  "histogram": [
    {
      "hour": "09:30",
      "count": 42,
      "bySeverity": {
        "emergency": 0,
        "alert": 0,
        "critical": 0,
        "error": 3,
        "warning": 8,
        "notice": 1,
        "info": 27,
        "debug": 3
      }
    }
  ]
}
```

**Top-level fields:**

| Field | Type | Description |
|---|---|---|
| `totalEntries` | `integer` | Number of entries matching the filter |
| `bufferSizeBytes` | `integer` | Maximum configured buffer capacity in bytes |
| `usedSizeBytes` | `integer` | Current buffer usage in bytes |
| `oldestTimestamp` | `string` (RFC3339) | Timestamp of the oldest entry. Omitted if buffer is empty. |
| `newestTimestamp` | `string` (RFC3339) | Timestamp of the newest entry. Omitted if buffer is empty. |
| `bucketMinutes` | `integer` | Bucket width in minutes (mirrors the selected `range`). |
| `histogram` | `array` | Buckets ordered oldest-first, one per time slot in the window. |

**Each histogram bucket:**

| Field | Type | Description |
|---|---|---|
| `hour` | `string` | Bucket label, formatted per the `range` (e.g. `"14:30"` or `"08/24 14:00"`). |
| `count` | `integer` | Total log entries in this bucket. |
| `bySeverity` | `object` | Per-severity counts for this bucket (see severity levels below). |

### Example

```
GET /api/stats?range=8h&severity=3&severity=4&hostname=web-01
```

---

## `GET /api/logs`

Returns paginated log entries sorted newest-first, with optional filters.

### Query parameters

| Parameter | Type | Repeatable | Default | Description |
|---|---|---|---|---|
| `page` | `integer` | No | `1` | Page number (1-indexed). Values `≤ 0` are treated as `1`. |
| `limit` | `integer` | No | `50` | Results per page. Clamped to `1`–`500`. |
| `from` | `string` | No | — | Inclusive start time (RFC3339). Returns `400` if malformed. |
| `to` | `string` | No | — | Inclusive end time (RFC3339). Returns `400` if malformed. |
| `client` | `string` | Yes | — | Filter by client IP. Repeat for multiple values (OR logic). |
| `hostname` | `string` | Yes | — | Filter by hostname. Repeat for multiple values (OR logic). |
| `tag` | `string` | Yes | — | Filter by syslog tag. Repeat for multiple values (OR logic). |
| `content` | `string` | No | — | Case-insensitive substring match on log message content. |
| `severity` | `integer` | Yes | — | Filter by severity level `0`–`7`. Repeat for multiple values (OR logic). Out-of-range values are silently ignored. |

### Response

```json
{
  "entries": [
    {
      "id": 1001,
      "client": "192.168.1.10",
      "facility": 1,
      "hostname": "web-01",
      "priority": 14,
      "severity": 6,
      "tag": "nginx",
      "timestamp": "2026-08-25T09:00:00Z",
      "content": "GET /api/health 200"
    }
  ],
  "totalCount": 342,
  "page": 1,
  "limit": 50,
  "totalPages": 7
}
```

**Top-level fields:**

| Field | Type | Description |
|---|---|---|
| `entries` | `array` | Page of matching log entries, newest-first. |
| `totalCount` | `integer` | Total matching entries across all pages. |
| `page` | `integer` | Current page number (echoed from request). |
| `limit` | `integer` | Page size used (echoed from request). |
| `totalPages` | `integer` | Total number of pages (`ceil(totalCount / limit)`). |

**Each log entry:**

| Field | Type | Description |
|---|---|---|
| `id` | `integer` | Monotonically increasing buffer ID. |
| `client` | `string` | Source IP address of the sender. |
| `facility` | `integer` | Syslog facility code. |
| `hostname` | `string` | Hostname reported in the log message. |
| `priority` | `integer` | Raw syslog priority (`facility × 8 + severity`). |
| `severity` | `integer` | Syslog severity `0`–`7` (see below). |
| `tag` | `string` | Syslog tag (program name). |
| `timestamp` | `string` (RFC3339) | Log event timestamp. |
| `content` | `string` | Log message body. |
| `reclassified` | `boolean` | `true` if severity was overridden by a reclassification rule. Omitted when `false`. |

### Example

```
GET /api/logs?severity=3&severity=4&hostname=web-01&hostname=web-02&from=2026-08-25T00:00:00Z&page=1&limit=25
```

---

## Severity levels

| Value | Name |
|---|---|
| `0` | emergency |
| `1` | alert |
| `2` | critical |
| `3` | error |
| `4` | warning |
| `5` | notice |
| `6` | info |
| `7` | debug |
