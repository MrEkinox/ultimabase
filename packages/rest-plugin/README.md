# @ultimabase/rest-plugin

Generated REST transport plugin.

REST parses requests, creates request contexts, normalizes input into Operation AST, calls Runtime, serializes output, maps errors, and mounts routes through an HTTP-server service.

It does not depend on Hono or PostgreSQL directly. If no HTTP server plugin is configured, it may request installation of the default Hono server plugin.
