---
'@ultimabase/jobs': patch
---

`enqueue` with an invalid input throws a plain error naming the job and each issue, so a request answers `500` and logs it, instead of a `400 VALIDATION_FAILED` that showed the client the paths of a job's schema. Validate what a client sends in the function that receives it.
