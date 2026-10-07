# typegen rebuild

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`.

Work in progress. First checkpoint: internals rewritten; generated output
byte-identical to the reference for every declaration produced by the
typegen, consumer, e2e and website suites (80 distinct outputs and errors)
and for the performance fixtures and examples. Full write-up follows.

| Production lines | Before | Checkpoint |
| ---------------- | ------ | ---------- |
| typegen          | 3018   | 2737       |
