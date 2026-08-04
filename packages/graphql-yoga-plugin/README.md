# @ultimabase/graphql-yoga-plugin

Official GraphQL over HTTP integration.

`graphqlYogaPlugin` installs GraphQL Core when necessary, mounts the final schema through an HTTP-server plugin, creates UltimaBase request context, installs AsyncLocalStorage, masks transport errors, and uses `/graphql` by default.

GraphiQL and Apollo Sandbox are separate nested plugins rather than modes of a generic explorer plugin.
