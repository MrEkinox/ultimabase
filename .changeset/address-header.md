---
'@ultimabase/http': minor
'@ultimabase/password': patch
---

`httpPlugin({ addressHeader })` reads the client's address in the header its platform sets, as
`do-connecting-ip` on DigitalOcean App Platform, where `X-Forwarded-For` holds the platform's own
address (D-405). password's limit of 100 failed sign-ins per address no longer counts a local or
private address, which every client shares behind a proxy the server does not read.
