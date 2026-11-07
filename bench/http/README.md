# HTTP benchmark

Measures what a whole request costs a server process (D-283), from the socket
to the socket: Hono, the caller, the rules, the statement and the response,
over REST and GraphQL. `bench/compare` and `bench/writes` stop at the query.
A change that claims to make requests cheaper is compared with the last run
below.

## Running

```sh
node bench/http/bench.ts [--seconds 6] [--concurrency 16] [--cases <text>] [--profile <file>] [--url postgres://…]
```

- The PostgreSQL server is `--url`, else `BENCH_DATABASE_URL`, else
  `localhost:54318`. The benchmark creates a schema of its own and drops it.
- It seeds 2000 posts with 3 comments each, then restarts under
  `NODE_ENV=production`, as the server a client reaches.
- The clients are a process of their own, each with a connection it keeps and
  one request at a time, so their work is not counted as the server's.
- A case runs 2 seconds untimed, then `--seconds` timed. Compare runs on a calm
  machine, and the median of three.
- `--profile` writes a CPU profile of the timed seconds only: name one case with
  `--cases`. The profiler slows the server down, so its figures do not compare
  with a run without it.

## What it counts

- Requests a second, and their p50 and p99 in milliseconds, as a client sees
  them.
- The server's CPU in µs a request: the fairest figure to compare, since a
  server that waits on PostgreSQL gains no throughput from a cheaper request.
- A status of 400 or more, or a GraphQL `errors` answer, is a failure: a case
  that fails measures nothing.
- The floor is a bare `node:http` server reading the row with `pg`: what no
  framework can go under.

## Runs

### 2026-11-07: the weekend's changes, D-284 to D-300

`412f269a3` against `b9331d074`, the same benchmark on both, 6 s a case, three runs each
in turn; medians. Same machine and clients as below.

| Case                                     | Requests /s before | Requests /s after | p50 before | p50 after | CPU, µs before | CPU, µs after |
| :--------------------------------------- | -----------------: | ----------------: | ---------: | --------: | -------------: | ------------: |
| REST, read by id, a visitor              |               2995 |       3393, +13 % |       5.44 |      4.68 |            350 |    302, −14 % |
| REST, read by id, signed in              |               1443 |        1571, +9 % |      10.71 |      9.82 |            731 |    634, −13 % |
| REST, a list of 25, nested, signed in    |                877 |       1055, +20 % |      17.29 |     14.68 |           1216 |    984, −19 % |
| REST, create, signed in                  |               1146 |       1431, +25 % |      13.72 |     10.78 |            950 |    762, −20 % |
| REST, update, signed in                  |                875 |        999, +14 % |      17.86 |     15.39 |           1187 |    984, −17 % |
| GraphQL, read by id, signed in           |               1203 |       1500, +25 % |      12.61 |     10.08 |            965 |    744, −23 % |
| GraphQL, a list of 25, nested, signed in |                502 |        713, +42 % |      31.54 |     21.96 |           1696 |   1243, −27 % |
| GraphQL, create, signed in               |               1147 |       1383, +21 % |      13.34 |     11.09 |            966 |    792, −18 % |
| GraphQL, update, signed in               |                840 |        964, +15 % |      18.28 |     15.90 |           1212 |   1051, −13 % |
| Floor: `node:http` and `pg`, read by id  |               5148 |        5211, +1 % |       2.98 |      2.95 |            148 |      148, 0 % |

The floor moves 1 %: the machine was the same for both. The run below took its first case
cold; this one warms the server first, so it reads 2995 for a visitor where it read 2714.

### 2026-11-06: the reference, 5 s a case

Commit `412f269a3`, median of two runs. Node 24.20, PostgreSQL 18.6 in Docker on
the same machine, Intel i7-8700B, 16 clients.

| Case                                     | Requests /s |   p50 |   p99 | CPU, µs |
| :--------------------------------------- | ----------: | ----: | ----: | ------: |
| REST, read by id, a visitor              |        2714 |  5.83 | 10.39 |     476 |
| REST, read by id, signed in              |        1542 |  9.96 | 17.05 |     679 |
| REST, a list of 25, nested, signed in    |         885 | 17.40 | 30.60 |    1206 |
| REST, create, signed in                  |        1195 | 13.01 | 21.50 |     923 |
| REST, update, signed in                  |         857 | 18.13 | 29.86 |    1263 |
| GraphQL, read by id, signed in           |        1257 | 12.18 | 22.38 |     901 |
| GraphQL, a list of 25, nested, signed in |         512 | 30.93 | 40.46 |    1653 |
| GraphQL, create, signed in               |        1163 | 13.29 | 23.08 |     980 |
| GraphQL, update, signed in               |         841 | 18.18 | 37.45 |    1264 |
| Floor: `node:http` and `pg`, read by id  |        5067 |  3.01 |  5.96 |     154 |

Signed in costs about 1.4 to 1.8 times a visitor: two more round trips. A request
costs three times the floor.
