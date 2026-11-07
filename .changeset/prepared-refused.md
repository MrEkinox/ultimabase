---
'@ultimabase/postgres': patch
---

A connection no longer keeps a prepared statement it was told to drop inside a transaction that had failed. Before, each such statement stayed on the server until the connection closed, past the 500 a connection keeps.
