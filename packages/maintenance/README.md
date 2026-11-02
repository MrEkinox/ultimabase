# @ultimabase/maintenance

Maintenance for UltimaBase. While it is on, every server answers each request and WebSocket upgrade with 503 `MAINTENANCE` and `Retry-After`, and closes the sockets open with 1012; Master's requests still pass.

Documentation: [Maintenance](https://ultimabase.dev/docs/maintenance).
