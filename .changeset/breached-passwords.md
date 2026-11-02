---
'@ultimabase/password': minor
---

`passwordPlugin({ breached: true })` refuses a new password that appears in
a known data breach, asking Have I Been Pwned with the first 5 characters
of its SHA-1; it is off by default, accepts the password when the service
does not answer within 2 seconds, asks nothing under `NODE_ENV=test`, and a
production start without the option warns. A new password equal to the
account's email, or to its local part, is refused. A refused reset keeps
its link (D-209).
