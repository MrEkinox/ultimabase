# Realtime benchmark

Measures what a write costs once subscribers follow it live (D-154), on
PostgreSQL: the statements the engine adds, the time until each subscriber
hears of it, and the memory each connection and each subscription holds.

## Running

```sh
node --expose-gc --max-old-space-size=24576 bench/realtime/bench.ts \
  [--subscribers 1000,10000] [--windows 25,1000] [--writes 20] [--url <url>]
```

- The PostgreSQL server is `--url`, else `BENCH_DATABASE_URL`, else
  `localhost:54318`. Each case works in a schema of its own, dropped at the
  end.
- The full matrix takes about 45 minutes; most of it is subscribing 10 000
  lists of 1000 rows.
- The script prints a Markdown table to paste below, with the date.

## What it counts

- `Item` has a read rule on its own field: a user reads the rows they own
  and those of `all`. Every subscriber connects as a user of their own and
  lists `Item` ordered by `rank`, showing `--windows` rows and selecting
  `title` and `rank`.
- One list: every subscriber follows the rows of `all`, so a write reaches
  all of them. A list each: each one follows their own rows, so a write
  reaches one subscriber.
- Each list has 10 rows past its window. A case makes two untimed rounds,
  then `--writes` rounds of an update in the middle of the window, an insert
  at its top and the delete of that row, which lets the next one in.
- Statements: the statements the adapter runs from the write's return until
  the engine is quiet, the write's own excluded, as min–max over the rounds.
- p50 and p99: the time from the write's return to each subscriber's
  message. Last message p50: the median time until the last one.
- Connection and Subscription: the heap each one holds after a full garbage
  collection. Subscribe all: the time to open every list, 16 at a time.
- Commit rate: 5000 updates by 16 writers on 100 rows, on a model no live
  read follows, then on `Item`, followed.

## Runs

### 2026-10-29: shared reads, commit `eeae6e9a`

Intel i7-8700B, 64 GB, macOS 15, PostgreSQL 18.6 in Docker, Node 24.20; 20
writes of each kind a case; times in ms, memory in KiB.

A flush now reads each changed row, and the rows after a window, once for
every list that shows them. Before this commit, on one list of 25 rows
followed by 1000 subscribers, an update cost 1000 statements and reached the
last subscriber after 309 ms at the median; a delete cost 2000 and 577 ms.

| Subscribers | Lists       | Window | Write  | Statements |    p50 |    p99 | Last message p50 | Connection | Subscription | Subscribe all |
| ----------: | ----------- | -----: | ------ | ---------: | -----: | -----: | ---------------: | ---------: | -----------: | ------------: |
|        1000 | one list    |     25 | update |        1–1 |   67.3 |   84.9 |             80.2 |        4.1 |         13.3 |         698.2 |
|        1000 | one list    |     25 | insert |        1–1 |   68.3 |   86.0 |             83.1 |        4.1 |         13.3 |         698.2 |
|        1000 | one list    |     25 | delete |        2–2 |   70.8 |   90.5 |             87.6 |        4.1 |         13.3 |         698.2 |
|        1000 | one list    |   1000 | update |        1–1 |  255.9 |  453.2 |            450.2 |        1.8 |        305.0 |        5454.9 |
|        1000 | one list    |   1000 | insert |        1–1 |  252.1 |  444.1 |            445.7 |        1.8 |        305.0 |        5454.9 |
|        1000 | one list    |   1000 | delete |        2–2 |  254.8 |  449.2 |            448.7 |        1.8 |        305.0 |        5454.9 |
|        1000 | a list each |     25 | update |        1–1 |   56.7 |   57.7 |             57.4 |        1.9 |         11.4 |         669.4 |
|        1000 | a list each |     25 | insert |        1–1 |   53.0 |   53.8 |             58.5 |        1.9 |         11.4 |         669.4 |
|        1000 | a list each |     25 | delete |        2–2 |   58.2 |   59.9 |             58.2 |        1.9 |         11.4 |         669.4 |
|        1000 | a list each |   1000 | update |        1–1 |   57.7 |   58.5 |             58.1 |        1.9 |        305.3 |        5076.1 |
|        1000 | a list each |   1000 | insert |        1–1 |   53.9 |   54.4 |             59.7 |        1.9 |        305.3 |        5076.1 |
|        1000 | a list each |   1000 | delete |        2–2 |   58.7 |   60.2 |             58.7 |        1.9 |        305.3 |        5076.1 |
|       10000 | one list    |     25 | update |        1–1 |  187.5 |  319.3 |            320.8 |        1.9 |         11.3 |        5765.8 |
|       10000 | one list    |     25 | insert |        1–1 |  200.3 |  345.2 |            345.7 |        1.9 |         11.3 |        5765.8 |
|       10000 | one list    |     25 | delete |        2–2 |  208.5 |  360.2 |            360.6 |        1.9 |         11.3 |        5765.8 |
|       10000 | one list    |   1000 | update |        1–1 | 2103.4 | 4904.3 |           4075.9 |        1.9 |        305.3 |       55101.0 |
|       10000 | one list    |   1000 | insert |        1–1 | 2062.7 | 4011.4 |           4026.4 |        1.9 |        305.3 |       55101.0 |
|       10000 | one list    |   1000 | delete |        2–2 | 2081.9 | 4105.3 |           4036.7 |        1.9 |        305.3 |       55101.0 |
|       10000 | a list each |     25 | update |        1–1 |   85.9 |   87.5 |             85.9 |        1.9 |         11.3 |        5649.6 |
|       10000 | a list each |     25 | insert |        1–1 |   53.4 |   54.5 |            104.9 |        1.9 |         11.3 |        5649.6 |
|       10000 | a list each |     25 | delete |        2–2 |   87.4 |   90.0 |             87.7 |        1.9 |         11.3 |        5649.6 |
|       10000 | a list each |   1000 | update |        1–1 |   93.4 |   97.0 |             94.5 |        1.9 |        305.3 |       52769.4 |
|       10000 | a list each |   1000 | insert |        1–1 |   53.9 |   54.7 |            112.9 |        1.9 |        305.3 |       52769.4 |
|       10000 | a list each |   1000 | delete |        2–2 |   94.8 |   95.8 |             94.8 |        1.9 |        305.3 |       52769.4 |

Commit rate, 16 writers: 3069 updates/s without the feed, 2727 with it.

- Statements no longer grow with the subscribers: one for the changed row,
  and a second on a delete for the row coming into view and those after it.
- The time still grows with the subscribers on one list, and with its
  window: each subscriber's own work in memory (its window's moves and the
  find pipeline run as its caller) is what is left. 10 000 subscribers on one
  list of 1000 rows hear of a write after 2.1 s at the median, 4.1 s for the
  last.
- A subscription to 1000 rows holds 305 KiB; 10 000 of them hold 3 GiB.
