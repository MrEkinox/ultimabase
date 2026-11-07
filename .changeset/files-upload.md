---
'@ultimabase/files': patch
---

`diskFiles()` reads an upload 1 MiB ahead and writes it 1 MiB at a time, so a 5 MB upload runs at 525 to 560 MB/s instead of 391 to 444 MB/s, and a 200 MB one at 1045 to 1100 MB/s instead of 771 to 856 MB/s.
