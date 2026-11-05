---
'@ultimabase/files': patch
---

`s3({ publicUrl })` takes `undefined`, as the other options read from the
environment do: `publicUrl: process.env['S3_PUBLIC_URL']` type-checks, and
`undefined` keeps the storage's own URL.
