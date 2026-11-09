---
'@ultimabase/auth': patch
'@ultimabase/password': patch
---

A sign-in or sign-out sent over a GraphQL WebSocket fails without ending or opening a session, and auth's API gives sign-in methods `selfOrMaster`, the check password's user commands now share.
