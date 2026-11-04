---
'@ultimabase/http': patch
'@ultimabase/graphql': patch
---

Each operation sent over a GraphQL WebSocket counts as a request of its
address: over the limit it fails with `TOO_MANY_ATTEMPTS` and
`details.retryAfter`, and the socket stays open. `Upgrade` gains `limit()`,
which counts one more request for a plugin's own socket (D-230). A live
function's subscription is refused past `maxRows`, as its query over HTTP
(D-229). A value graphql-js cannot send, as an `Int` above 2³¹, is an
`INTERNAL` error, logged with its `correlationId`, instead of
`BAD_USER_INPUT` (D-106).
