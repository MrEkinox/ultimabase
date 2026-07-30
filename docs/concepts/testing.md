# Testing

Vitest is the test runner.

Each feature should have:

- focused runtime unit tests;
- compile-time tests for public inference;
- integration tests when it crosses a package boundary;
- regression tests for fixed bugs.

PostgreSQL integration tests use one Testcontainers PostgreSQL instance and one PostgreSQL schema per Vitest worker. Application instances and registries are never shared between workers.

Contract suites validate database adapters, transports, caches, and future extension points.
