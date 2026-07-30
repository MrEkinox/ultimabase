# @ultimabase/graphql

Server-independent `graphqlCorePlugin`.

It generates typed GraphQL objects, inputs, filters, mutations, and cursor connections; converts selections to Query AST; installs DataLoader; merges custom `GraphQLSchema` instances; and exposes the same executor used by network adapters.

Nexus, Pothos, and other builders remain fully supported because custom behavior is supplied as a completed `GraphQLSchema`, not through an UltimaBase-specific resolver DSL.
