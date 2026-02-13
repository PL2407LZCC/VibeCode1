# Monitoring and Observability

This application exposes basic signals so you can track health, ingest metrics, and correlate logs once it is running in a long-lived environment.

## Health Checks

- **Endpoint**: `GET /health`
- **Purpose**: Verifies database connectivity (`SELECT 1`) and that the uploads directory is available.
- **Responses**:
  - `200 OK` when all dependencies are healthy.
  - `206 Partial Content` when non-critical checks (e.g., uploads directory) fail.
  - `503 Service Unavailable` when critical checks (e.g., database) fail.
- **Usage**: Configure your load balancer or container orchestrator to poll this endpoint. A failing status should trigger restarts or traffic draining.

## Metrics

- **Endpoint**: `GET /metrics`
- **Format**: Prometheus exposition (`prometheus` content type).
- **Included Metrics**:
  - Default Node.js process metrics (CPU, memory, event loop). Collected via `prom-client`.
  - `http_request_duration_seconds` histogram labelled with `method`, `route`, and `status` to measure latency.
- **Collection Guidance**:
  1. Configure a Prometheus scrape job that targets the API service (e.g., `http://<api-host>:3000/metrics`).
  2. Set a scrape interval appropriate for kiosk traffic (15–30s is typically sufficient).
  3. Visualise metrics with Grafana dashboards. Suggested panels:
     - P99/P95 request latency by route.
     - Request volume per route.
     - API error rate (filter by `status >= 500`).
  4. Configure alert rules in Prometheus/Grafana for high latency, 5xx spikes, or gaps in scrapes.

## Structured Logs

- **Format**: JSON via `pino` and `pino-http`.
- **Correlation**: Each request is assigned a `requestId`. If an upstream proxy supplies `X-Request-Id`, that value is reused.
- **Shipping Logs**: Forward container stdout/stderr to your log aggregation tool (e.g., Loki, CloudWatch, Logstash). Parse by JSON to filter on `requestId`, `req.method`, `res.statusCode`, etc.

## Dashboard Starter Ideas

- **Service Latency**: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))`
- **Error Rate**: `sum(rate(http_request_duration_seconds_count{status=~"5.."}[5m]))`
- **Traffic Volume**: `sum(rate(http_request_duration_seconds_count[5m])) by (route)`
- **Process Memory**: `process_resident_memory_bytes`

## Next Steps

- Integrate alerts into your incident response channel (PagerDuty, Slack).
- Extend metrics with business KPIs (e.g., purchases per hour) if needed.
- Use the structured logs to trace invite onboarding issues or kiosk checkout errors.
