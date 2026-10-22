# Write benchmark

Measures what a write costs (D-48, D-99): its round trips, BEGIN and COMMIT
included, and its time, for each write case, on `memory()` and PostgreSQL. A
change that claims to make writes cheaper is compared with the last run below.

## Running

```sh
node bench/writes/bench.ts [--runs 200] [--url postgres://…]
```

- The PostgreSQL server is `--url`, else `BENCH_DATABASE_URL`, else
  `localhost:54318`. The benchmark creates a schema of its own and drops it.
- Each case runs a tenth of `--runs` untimed, then `--runs` timed. What a run
  needs, such as the row a delete removes, is made before its clock starts.
- The script prints a Markdown table to paste below, with the date, the Node
  and PostgreSQL versions, and the number of runs.

## What it counts

- PostgreSQL: every statement the adapter sends, BEGIN and COMMIT included,
  through its `log` option, as `yarn test:postgres` counts them (D-98).
- `memory()`: every call the kernel makes to the adapter. A write is one call
  whatever its statements, so a write PostgreSQL splits counts more there: a
  join table's pair unlinked and linked again in one write is 1 on `memory()`
  and 4 on PostgreSQL (BEGIN, two statements, COMMIT), since a pair changed
  twice takes two statements (D-101).
- Times are each case's median, and its 95th percentile on PostgreSQL, in
  milliseconds. Rows add up across runs; the rows a case reads stay few.

## Runs

### 2026-10-22: the reference, 200 runs

Commit `7d29c8b9`. Node 24.20, PostgreSQL 18.6 in Docker on the same machine,
Intel i7-8700B, load average 1.6. `memory()` times grow with the rows the
runs add, since it scans its tables.

| Case                                      | memory trips | memory median | PostgreSQL trips | PostgreSQL median | PostgreSQL p95 |
| ----------------------------------------- | -----------: | ------------: | ---------------: | ----------------: | -------------: |
| create                                    |            1 |          0.14 |                1 |              0.81 |           0.95 |
| create, a one and a many connected        |            1 |          0.26 |                1 |              1.15 |           1.40 |
| update by id, Master                      |            1 |          0.09 |                1 |              0.87 |           1.05 |
| update by id, a user under access rules   |            4 |          0.40 |                4 |              1.96 |           2.24 |
| delete by id, a user under access rules   |            4 |          0.44 |                4 |              1.68 |           2.28 |
| delete by id, Master, one row cascaded    |            5 |          0.46 |                5 |              2.45 |           2.88 |
| update, a many disconnected and connected |            1 |          0.46 |                4 |              1.98 |           2.30 |
| update, connected from the other side     |            1 |          0.45 |                1 |              1.02 |           1.28 |
| create, an afterCreate hook               |            5 |          0.32 |                5 |              2.12 |           2.38 |
| create, an afterCreateCommit hook         |            4 |          0.34 |                4 |              1.84 |           2.17 |
| transaction(), two creates                |            4 |          0.86 |                4 |              2.00 |           2.36 |

### 2026-10-22: a join move, a cascade and a read-back in one statement, 200 runs

Commit `255675f6` (D-101 to D-103). Same machine, load average 2.8.

| Case                                      | memory trips | memory median | PostgreSQL trips | PostgreSQL median | PostgreSQL p95 |
| ----------------------------------------- | -----------: | ------------: | ---------------: | ----------------: | -------------: |
| create                                    |            1 |          0.14 |                1 |              0.75 |           0.89 |
| create, a one and a many connected        |            1 |          0.27 |                1 |              1.09 |           1.36 |
| update by id, Master                      |            1 |          0.09 |                1 |              0.78 |           1.07 |
| update by id, a user under access rules   |            4 |          0.43 |                4 |              1.91 |           2.19 |
| delete by id, a user under access rules   |            4 |          0.44 |                4 |              1.70 |           2.16 |
| delete by id, Master, one row cascaded    |            1 |          0.27 |                1 |              0.89 |           1.13 |
| update, a many disconnected and connected |            1 |          0.47 |                1 |              1.11 |           1.49 |
| update, connected from the other side     |            1 |          0.46 |                1 |              0.91 |           1.14 |
| create, an afterCreate hook               |            5 |          0.35 |                5 |              2.17 |           2.50 |
| create, an afterCreateCommit hook         |            4 |          0.35 |                4 |              1.81 |           2.18 |
| transaction(), two creates                |            4 |          0.88 |                4 |              1.90 |           2.26 |

Against the reference: the cascaded delete goes from 5 round trips and
2.45 ms to 1 and 0.89 ms (D-102), the `many` moved from 4 and 1.98 ms to 1
and 1.11 ms (D-101), a create and an update by id lose 0.06 and 0.09 ms
(D-103). The rest is unchanged within noise.

### 2026-10-22: a user's row read without a lock, checked unchanged, 200 runs

Commit `96937fde` (D-104). Same machine, load average 3.6.

| Case                                      | memory trips | memory median | PostgreSQL trips | PostgreSQL median | PostgreSQL p95 |
| ----------------------------------------- | -----------: | ------------: | ---------------: | ----------------: | -------------: |
| create                                    |            1 |          0.14 |                1 |              0.74 |           0.93 |
| create, a one and a many connected        |            1 |          0.26 |                1 |              1.08 |           1.28 |
| update by id, Master                      |            1 |          0.10 |                1 |              0.78 |           0.96 |
| update by id, a user under access rules   |            2 |          0.57 |                2 |              1.39 |           1.65 |
| delete by id, a user under access rules   |            2 |          0.79 |                2 |              1.19 |           1.52 |
| delete by id, Master, one row cascaded    |            1 |          0.27 |                1 |              0.90 |           1.13 |
| update, a many disconnected and connected |            1 |          0.48 |                1 |              1.09 |           1.34 |
| update, connected from the other side     |            1 |          0.47 |                1 |              0.91 |           1.06 |
| create, an afterCreate hook               |            5 |          0.37 |                5 |              2.21 |           2.58 |
| create, an afterCreateCommit hook         |            4 |          0.38 |                4 |              1.82 |           2.09 |
| transaction(), two creates                |            4 |          0.85 |                4 |              1.92 |           2.33 |

Against the previous run: a user's update goes from 4 round trips and
1.91 ms to 2 and 1.39 ms on PostgreSQL, a user's delete from 4 and 1.70 ms
to 2 and 1.19 ms. On `memory()` both grow, by 0.14 and 0.35 ms: the check compares the whole
record by scanning the table, which grows across runs. The rest is unchanged within noise.
