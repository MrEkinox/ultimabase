# @ultimabase/core

Infrastructure-neutral application contracts.

Responsibilities:

- isolated `FrameworkApplication` instances;
- plugin definitions and global plugin graph;
- nested plugin normalization;
- typed service tokens and registries;
- lifecycle phases;
- shared contexts and framework errors;
- registries used during plugin setup.

Core contains no CRUD implementation and must never import concrete database, server, transport, migration, permission, auth, cache, or jobs packages.
