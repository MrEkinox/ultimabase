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
  whatever its statements, so a write PostgreSQL splits counts more there:
  `update, a many disconnected and connected` is 1 on `memory()` and 4 on
  PostgreSQL (BEGIN, two statements, COMMIT), since a join table written twice
  takes two statements (D-99).
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
