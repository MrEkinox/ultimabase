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

### 2026-10-22: smoke run, 10 runs

Not a reference: it checks that the script runs and that the round trips
match the contract's (`packages/testing/src/round-trips.ts`). Node 24.20,
PostgreSQL 18.6 in Docker, Intel i7-8700B.

| Case                                      | memory trips | memory median | PostgreSQL trips | PostgreSQL median | PostgreSQL p95 |
| ----------------------------------------- | -----------: | ------------: | ---------------: | ----------------: | -------------: |
| create                                    |            1 |          0.15 |                1 |              0.95 |           1.16 |
| create, a one and a many connected        |            1 |          0.18 |                1 |              1.37 |           1.46 |
| update by id, Master                      |            1 |          0.12 |                1 |              1.03 |           1.34 |
| update by id, a user under access rules   |            4 |          0.21 |                4 |              2.27 |           2.73 |
| delete by id, a user under access rules   |            4 |          0.15 |                4 |              1.89 |           2.32 |
| delete by id, Master, one row cascaded    |            5 |          0.18 |                5 |              2.77 |           2.83 |
| update, a many disconnected and connected |            1 |          0.17 |                4 |              2.20 |           2.53 |
| update, connected from the other side     |            1 |          0.16 |                1 |              1.12 |           1.40 |
| create, an afterCreate hook               |            5 |          0.10 |                5 |              2.51 |           2.61 |
| create, an afterCreateCommit hook         |            4 |          0.09 |                4 |              2.01 |           2.27 |
| transaction(), two creates                |            4 |          0.18 |                4 |              2.26 |           2.51 |
