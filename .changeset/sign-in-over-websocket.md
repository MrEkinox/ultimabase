---
'ultimabase': patch
'@ultimabase/http': patch
'@ultimabase/graphql': patch
'@ultimabase/auth': patch
'@ultimabase/password': patch
---

Over a GraphQL WebSocket, `signUp`, `signIn` and `changePassword` are refused with `BAD_REQUEST` before anything is written: a sign-up no longer creates its user, nor a password change its password, then fails at the cookie. `client.cookies.settable` says whether a cookie can be set, and auth's API gives `needsCookies(client)` to refuse the same way.
