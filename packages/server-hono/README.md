# @ultimabase/server-hono

Official `honoServerPlugin` for Node.js.

It provides the HTTP routing service consumed by transport plugins, accepts an existing Hono application or creates one, listens on port `1337` by default, and participates in graceful lifecycle shutdown.

Future Express or Fastify server plugins should implement the same Core transport-mounting contract.
