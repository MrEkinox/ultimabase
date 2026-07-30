# @ultimabase/query

Transport-neutral Query and Operation AST contracts, normalization, cursor contracts, operators, and immutable query definitions.

The public `Query<TSchema>` class is unbound and reusable. Runtime binding produces an executable `BoundQuery<TSchema>`.

This package does not execute operations and must not import Core, Runtime, a database, or a transport.
