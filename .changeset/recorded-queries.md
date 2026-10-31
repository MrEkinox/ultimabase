---
'@ultimabase/testing': minor
---

`testApplication(app).queries(callback)` lists the queries the callback sends to the database, such as `['find User', 'write Invite']`, so a test proves that a refusal reads nothing or that a loop does not query once per row (D-177).
