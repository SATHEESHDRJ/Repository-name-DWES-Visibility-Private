# DWES Whole-Project Performance Report

Date: 2026-07-17

## Measured

- Frontend production build: PASS (~3-6s)
- Backend test suite: 137 tests ~26-31s
- OperationalTwin3D lazy chunk ~6.42 kB

## Not measured (pilot/ops)

- 5/15 concurrent user load tests
- Login concurrency
- DWG conversion queue under load
- Tablet FPS 30 gate
- SSE fan-out latency at scale

See docs/hosting and k6 scripts for planned load tests.
