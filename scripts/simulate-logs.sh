#!/bin/bash

# Webtail Log Simulator
# Generates realistic log entries and sends them to the webtail server

set -e

# Configuration
WEBTAIL_URL="${WEBTAIL_URL:-http://localhost:8080}"
INTERVAL="${INTERVAL:-1}"  # seconds between batches
BATCH_SIZE="${BATCH_SIZE:-5}"  # logs per batch
DURATION="${DURATION:-0}"  # 0 = run forever

# Sample data for realistic logs
CLIENTS=("web-frontend" "api-gateway" "auth-service" "payment-service" "user-service" "notification-service" "analytics-worker")
HOSTNAMES=("prod-web-01" "prod-web-02" "prod-api-01" "prod-api-02" "staging-01" "dev-local")
FACILITIES=("daemon" "user" "local0" "local1" "syslog" "auth")
TAGS=("nginx" "app" "db" "cache" "queue" "cron" "healthcheck")

# Log message templates by severity
EMERGENCY_MSGS=(
    "CRITICAL: System out of memory, initiating emergency shutdown"
    "FATAL: Disk failure detected on primary storage"
    "EMERGENCY: Database cluster unreachable, all services affected"
)

ALERT_MSGS=(
    "ALERT: CPU usage exceeded 95% for 5 minutes"
    "ALERT: Memory pressure critical, swap usage at 90%"
    "ALERT: Connection pool exhausted, new connections failing"
)

CRITICAL_MSGS=(
    "CRITICAL: SSL certificate expires in 24 hours"
    "CRITICAL: Primary database failover initiated"
    "CRITICAL: Rate limiter triggered, blocking traffic"
)

ERROR_MSGS=(
    "ERROR: Failed to connect to database: connection refused"
    "ERROR: Request timeout after 30s - upstream server not responding"
    "ERROR: Authentication failed for user: invalid credentials"
    "ERROR: Failed to process payment: gateway returned error 500"
    "ERROR: Queue consumer crashed: message deserialization failed"
)

WARNING_MSGS=(
    "WARNING: Response time degraded - p99 latency at 2.5s"
    "WARNING: Cache miss rate increased to 45%"
    "WARNING: Retry attempt 3/5 for external API call"
    "WARNING: Connection pool utilization at 80%"
    "WARNING: Slow query detected: 850ms execution time"
)

NOTICE_MSGS=(
    "NOTICE: Scheduled maintenance starting in 1 hour"
    "NOTICE: New deployment v2.3.1 rolling out"
    "NOTICE: Feature flag dark-mode enabled for 10% of users"
    "NOTICE: Background job queue depth: 1523 items"
)

INFO_MSGS=(
    "INFO: Request processed successfully in 45ms"
    "INFO: User login successful: user_id=12345"
    "INFO: Cache refreshed for key: product_catalog"
    "INFO: Healthcheck passed: all dependencies healthy"
    "INFO: Scheduled task completed: daily_report_generation"
    "INFO: New WebSocket connection established"
    "INFO: API request: GET /api/v1/users - 200 OK"
    "INFO: Background job completed: email_batch_send"
)

DEBUG_MSGS=(
    "DEBUG: Entering function processRequest with params: id=123"
    "DEBUG: SQL query executed: SELECT FROM users WHERE id = ?"
    "DEBUG: Cache lookup for key: session_abc123 - HIT"
    "DEBUG: HTTP headers received: Content-Type=application/json"
    "DEBUG: Memory allocation: 2.3MB for request context"
    "DEBUG: Goroutine count: 847"
)

# Weighted severity distribution (realistic production logs)
# 0=emergency, 1=alert, 2=critical, 3=error, 4=warning, 5=notice, 6=info, 7=debug
SEVERITY_WEIGHTS=(1 2 3 10 15 20 40 9)  # Totals 100

# Helper functions
random_element() {
    local arr=("$@")
    echo "${arr[$RANDOM % ${#arr[@]}]}"
}

random_severity() {
    local r=$((RANDOM % 100))
    local cumulative=0
    for i in "${!SEVERITY_WEIGHTS[@]}"; do
        cumulative=$((cumulative + SEVERITY_WEIGHTS[i]))
        if [ $r -lt $cumulative ]; then
            echo $i
            return
        fi
    done
    echo 6  # Default to INFO
}

get_message_for_severity() {
    local severity=$1
    case $severity in
        0) random_element "${EMERGENCY_MSGS[@]}" ;;
        1) random_element "${ALERT_MSGS[@]}" ;;
        2) random_element "${CRITICAL_MSGS[@]}" ;;
        3) random_element "${ERROR_MSGS[@]}" ;;
        4) random_element "${WARNING_MSGS[@]}" ;;
        5) random_element "${NOTICE_MSGS[@]}" ;;
        6) random_element "${INFO_MSGS[@]}" ;;
        7) random_element "${DEBUG_MSGS[@]}" ;;
        *) echo "Unknown log event" ;;
    esac
}

generate_request_id() {
    # Generate a simple hex string for request ID
    local id=""
    for i in {1..8}; do
        id="${id}$(printf '%x' $((RANDOM % 16)))"
    done
    echo "$id"
}

generate_log_entry() {
    local severity=$(random_severity)
    local client=$(random_element "${CLIENTS[@]}")
    local hostname=$(random_element "${HOSTNAMES[@]}")
    local facility=$(random_element "${FACILITIES[@]}")
    local tag=$(random_element "${TAGS[@]}")
    local content=$(get_message_for_severity $severity)
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local priority=$((severity + (RANDOM % 8) * 8))  # priority = severity + facility * 8
    
    # Add some random context to messages
    local request_id=$(generate_request_id)
    local trace_id=$(generate_request_id)$(generate_request_id)
    content="$content [request_id=$request_id trace_id=$trace_id]"
    
    # Escape special characters for JSON
    content=$(echo "$content" | sed 's/"/\\"/g')
    
    echo "{\"client\":\"$client\",\"facility\":\"$facility\",\"hostname\":\"$hostname\",\"priority\":$priority,\"severity\":$severity,\"tag\":\"$tag\",\"timestamp\":\"$timestamp\",\"content\":\"$content\"}"
}

generate_batch() {
    local count=${1:-$BATCH_SIZE}
    local batch=""
    for ((i=0; i<count; i++)); do
        if [ -n "$batch" ]; then
            batch="$batch"$'\n'
        fi
        batch="$batch$(generate_log_entry)"
    done
    echo "$batch"
}

send_logs() {
    local logs="$1"
    local response
    
    # Send gzip-compressed JSONL
    response=$(echo "$logs" | gzip | curl -s -X POST \
        -H "Content-Type: application/x-ndjson" \
        -H "Content-Encoding: gzip" \
        --data-binary @- \
        "${WEBTAIL_URL}/ingest" 2>&1)
    
    echo "$response"
}

print_usage() {
    cat <<EOF
Webtail Log Simulator

Usage: $0 [OPTIONS]

Options:
    -u, --url URL       Webtail server URL (default: http://localhost:8080)
    -i, --interval SEC  Seconds between batches (default: 1)
    -b, --batch SIZE    Number of logs per batch (default: 5)
    -d, --duration SEC  Duration to run in seconds, 0=forever (default: 0)
    -n, --count NUM     Send exactly NUM logs and exit
    -h, --help          Show this help message

Environment variables:
    WEBTAIL_URL         Server URL
    INTERVAL            Batch interval
    BATCH_SIZE          Logs per batch
    DURATION            Run duration

Examples:
    # Send logs continuously every second
    $0

    # Send 100 logs and exit
    $0 -n 100

    # Send logs to a different server every 2 seconds
    $0 -u http://webtail.example.com:8080 -i 2

    # Run for 60 seconds with large batches
    $0 -d 60 -b 20

EOF
}

# Parse arguments
SINGLE_COUNT=0
while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--url)
            WEBTAIL_URL="$2"
            shift 2
            ;;
        -i|--interval)
            INTERVAL="$2"
            shift 2
            ;;
        -b|--batch)
            BATCH_SIZE="$2"
            shift 2
            ;;
        -d|--duration)
            DURATION="$2"
            shift 2
            ;;
        -n|--count)
            SINGLE_COUNT="$2"
            shift 2
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

# Main execution
echo "=========================================="
echo "  Webtail Log Simulator"
echo "=========================================="
echo "Server URL:    $WEBTAIL_URL"
echo "Batch size:    $BATCH_SIZE logs"
echo "Interval:      ${INTERVAL}s"
if [ "$SINGLE_COUNT" -gt 0 ]; then
    echo "Mode:          Send $SINGLE_COUNT logs and exit"
elif [ "$DURATION" -gt 0 ]; then
    echo "Duration:      ${DURATION}s"
else
    echo "Duration:      Run forever (Ctrl+C to stop)"
fi
echo "=========================================="
echo ""

# Check server connectivity
echo "Checking server connectivity..."
if ! curl -s --connect-timeout 5 "${WEBTAIL_URL}/health" > /dev/null 2>&1; then
    echo "ERROR: Cannot connect to ${WEBTAIL_URL}"
    echo "Make sure the webtail server is running."
    exit 1
fi
echo "Server is reachable!"
echo ""

# Single count mode
if [ "$SINGLE_COUNT" -gt 0 ]; then
    echo "Sending $SINGLE_COUNT logs..."
    total_sent=0
    while [ $total_sent -lt $SINGLE_COUNT ]; do
        remaining=$((SINGLE_COUNT - total_sent))
        batch_count=$BATCH_SIZE
        if [ $remaining -lt $BATCH_SIZE ]; then
            batch_count=$remaining
        fi
        
        logs=$(generate_batch $batch_count)
        response=$(send_logs "$logs")
        ingested=$(echo "$response" | grep -o '"ingested":[0-9]*' | cut -d: -f2)
        if [ -z "$ingested" ]; then
            ingested=0
        fi
        total_sent=$((total_sent + ingested))
        echo "Sent batch: $ingested logs (total: $total_sent/$SINGLE_COUNT)"
    done
    echo ""
    echo "Done! Sent $total_sent logs."
    exit 0
fi

# Continuous mode
start_time=$(date +%s)
total_sent=0
batch_num=0

trap 'echo ""; echo "Stopping..."; echo "Total logs sent: $total_sent in $batch_num batches"; exit 0' INT TERM

echo "Starting log generation (press Ctrl+C to stop)..."
echo ""

while true; do
    # Check duration limit
    if [ "$DURATION" -gt 0 ]; then
        elapsed=$(($(date +%s) - start_time))
        if [ $elapsed -ge $DURATION ]; then
            echo ""
            echo "Duration limit reached ($DURATION seconds)"
            break
        fi
    fi
    
    # Generate and send batch
    logs=$(generate_batch)
    response=$(send_logs "$logs")
    ingested=$(echo "$response" | grep -o '"ingested":[0-9]*' | cut -d: -f2)
    if [ -z "$ingested" ]; then
        ingested=0
    fi
    
    total_sent=$((total_sent + ingested))
    batch_num=$((batch_num + 1))
    
    # Print status
    timestamp=$(date +"%H:%M:%S")
    echo "[$timestamp] Batch $batch_num: sent $ingested logs (total: $total_sent)"
    
    # Wait for next batch
    sleep "$INTERVAL"
done

echo ""
echo "=========================================="
echo "  Simulation Complete"
echo "=========================================="
echo "Total logs sent: $total_sent"
echo "Total batches:   $batch_num"
echo "=========================================="
