---
'@ultimabase/rest': patch
---

A gzipped live read over Server-Sent Events keeps a smaller compressor: about a third less memory a stream (430 to 286 KiB with 2 000 streams open) and a sixth to a quarter less CPU for the server, for 1 to 2 % more bytes an event.
