---
'@ultimabase/sentry': patch
---

An error the plugin cannot read no longer ends the process: its span's `error.type` is `unknown`, and an error Sentry fails to capture is skipped.
