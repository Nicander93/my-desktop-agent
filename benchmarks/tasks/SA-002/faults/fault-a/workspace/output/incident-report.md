# Incident Report — 2024-06-18

## Facts
- Deploy v2.4.1 completed at 14:20:03Z (E001).
- HTTP 503 on /api/orders at 14:32:02Z (E002).
- Database connection pool exhausted at 14:32:05Z (E003).
- Access log 503 at 14:32:03Z (E005).

## Inferences
- Connection leak after deploy likely caused pool exhaustion (based on E003, E004).
- User-facing outage began ~14:32Z (based on E002, E005).

## Verification steps
1. Confirm conn-88 release path in v2.4.1 diff.
2. Re-run load test after patch; pool idle count should stay >0.
