---
'@ultimabase/acl': patch
---

An ACL field refuses an object of another class, such as an ACL of another copy of the package or
a `Date`, with "An ACL is an ACL or { read, write }." It read as an empty ACL, which only Master
can read or write.
