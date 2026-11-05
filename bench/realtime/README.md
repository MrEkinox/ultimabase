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

## Virtual fields

```sh
node --expose-gc bench/realtime/virtuals.ts \
  [--subscribers 1000] [--windows 25,1000] [--writes 10] [--url <url>]
```

Measures what a write costs live lists that select a virtual field reading
another model (D-187). `Project` has a read rule on its `owner` and a
virtual `openTasks`, a `runMany` counting its open `Task` rows with a
`groupBy` as the caller. Subscribers list `Project` as above, one list or a
list each, with and without `openTasks` selected; each write creates a
`Task` on a shown project. Statements and times are counted as above;
Messages is the most subscribers that heard of one write.

### 2026-11-01: virtuals followed (D-187)

Same machine as below; 10 writes a case; times in ms.

| Subscribers | Lists       | Window | Virtual selected | Statements | Messages |     p50 |     p99 | Last message p50 |
| ----------: | ----------- | -----: | ---------------- | ---------: | -------: | ------: | ------: | ---------------: |
|        1000 | one list    |     25 | no               |        0–0 |        0 |     0.0 |     0.0 |              0.0 |
|        1000 | one list    |     25 | yes              |  1002–1002 |     1000 |   319.4 |   582.2 |            584.2 |
|        1000 | one list    |   1000 | no               |        0–0 |        0 |     0.0 |     0.0 |              0.0 |
|        1000 | one list    |   1000 | yes              |  1002–1002 |     1000 | 10314.5 | 20216.2 |          20297.0 |
|        1000 | a list each |     25 | no               |        0–0 |        0 |     0.0 |     0.0 |              0.0 |
|        1000 | a list each |     25 | yes              |        3–3 |        1 |    69.2 |    71.1 |             69.2 |
|        1000 | a list each |   1000 | no               |        0–0 |        0 |     0.0 |     0.0 |              0.0 |
|        1000 | a list each |   1000 | yes              |        3–3 |        1 |   122.1 |   129.5 |            122.1 |

- A list each: the write reaches the one subscriber whose project it is;
  the others test it against their `groupBy`'s `where` and read nothing.
- One list: each subscriber counts again as itself, one `groupBy` each, and
  computes its whole window again, which is what 1000 rows cost.

## Rights lost

```sh
node --expose-gc bench/realtime/rights.ts \
  [--subscribers 10000] [--windows 25] [--writes 5] [--cases 0,1,2,3] [--url <url>]
```

Measures what losing a right costs live lists when no row they show is
written (D-196). A user reads the `Doc` rows of the teams they are a member
of, through `Member` rows that point to the user and the team, and every
`Sheet` while they hold the `Reader` role. Each case makes `--writes`
losses:

- link, one team: every subscriber is a member of one team; one member row
  is deleted.
- link, a team each: each subscriber reads their own team; one member row
  is deleted.
- role, one user leaves: every subscriber is a reader; one user leaves the
  role.
- role, renamed for all: the role is renamed, and every subscriber loses it.

Statements are counted as above. The first and last loser message are the
times until the losers hear of it; the last statement, until the engine's
last read. Others' messages are those sent to subscribers who lost nothing.

### 2026-11-02: a lost right re-checks only the rows it may reach (D-196)

Same machine; 5 losses a case; times in ms. Before is commit `bfff0777`.

| Case                  | Window | Statements before | Statements after | Loser message before | Loser message after | Last statement before | Last statement after |
| --------------------- | -----: | ----------------: | ---------------: | -------------------: | ------------------: | --------------------: | -------------------: |
| link, one team        |     25 |        9998–10002 |              4–4 |                 63.3 |               147.1 |                3602.6 |                147.0 |
| link, a team each     |     25 |       19992–20000 |              4–4 |                 66.7 |               142.7 |                7359.9 |                142.5 |
| role, one user leaves |     25 |       10002–10002 |              4–4 |                 76.0 |               187.0 |                6785.2 |                186.9 |
| role, renamed for all |     25 |       40002–40002 |      40002–40002 |      58.2 to 10859.3 |     58.5 to 11089.3 |               10859.3 |              11089.3 |
| link, one team        |   1000 |                 — |              4–4 |                    — |               177.3 |                     — |                175.1 |
| role, one user leaves |   1000 |                 — |              4–4 |                    — |               182.1 |                     — |                182.1 |

Others' messages are 0 in every case. The renamed role's before is the
run of 2026-11-01, before the bench's memberships were `one` keys. `link, a
team each` on windows of 1000 rows was not run: its 10 million rows do not
fit the server's 4 GB data volume.

- A lost link or role costs 4 statements instead of one or two per
  subscriber, and the engine is done in under 190 ms instead of 3.6 to 7.4 s.
- The loser hears of it later, 145 to 190 ms instead of 65 to 75: the
  flush judges each subscriber's levels in memory, about 10 µs each, before
  the loser's message goes out.
- A renamed role is lost by every subscriber: each one is built again, as
  before.
- A membership told by a text field, `user: f.string()`, still re-checks
  every window, since a delete tells its stored `one` keys alone: with this
  change, one team's member row deleted costs 9998–10002 statements and
  a last statement at 3.7 s.

## Live lists

```sh
node --expose-gc --max-old-space-size=24576 bench/realtime/lists.ts \
  [--cases 25x100,25x1000,2000x10,10000x5,50000x5] [--total 55000] [--url <url>]
node --expose-gc --max-old-space-size=24576 bench/realtime/rooms.ts \
  [--rooms 200] [--viewers 5] [--window 25] [--open-parts] [--url <url>]
node --max-old-space-size=8192 bench/realtime/hook.ts
node --expose-gc --max-old-space-size=24576 bench/realtime/wire.ts \
  [--cases 25x1000,2000x100,10000x20,50000x20] [--total 55000] [--plain] \
  [--busy] [--url <url>]
NODE_ENV=production node --max-old-space-size=16384 bench/realtime/render.ts
node bench/realtime/pages.ts [--target 50000] [--url <url>]
```

The gate of D-252: what a live list costs, whatever its size. The tables are
analyzed before anything is timed: without planner statistics a nested read
costs about 1 ms a row, and a production table has them.

- `lists.ts`: each row has an author and 8 attachments, which every subscriber
  reads, under a read rule that does not name the viewer. A case is
  `<rows>x<subscribers>` on one list. Subscribe each is the first read of one
  list; KiB a subscriber and Bytes a row, the heap they hold after a full
  garbage collection; Grow, the time for 25 more rows. Each write runs three
  times: its statements and the last subscriber's message, as medians.
- `rooms.ts`: a chat. Only a room's members may read its messages and their
  attachments, a rule naming the viewer through a relation. Each write goes to
  one room; Other rooms told counts the messages sent past it. `--open-parts`
  drops the rule on attachments.
- `hook.ts`: the client alone, without a database. It sends a list through
  `ultimabaseLive` read as `useLiveSubscription` does (hook), and as a plain
  subscription (plain), then an update and a row gone. React's rendering is not
  counted.
- `wire.ts`: the lists of `lists.ts` from the write to the socket's far end, read
  by real clients over GraphQL over WebSocket from a thread of their own, so
  JSON, compression and the sockets count; clients do not parse. All at once
  opens every subscriber together, and Others wait is what another client's
  write waits meanwhile, median and last; Caught up, how long messages kept
  arriving after that. `--busy` makes that write change an author the list shows,
  so the opening list is told too. `--plain` turns compression off.
- `render.ts`: the client alone, with React: the list through
  `useLiveSubscription`, up to the commit, every row rendered, or `memo` rows, or
  only the rows a virtual list keeps mounted. On happy-dom: a browser's layout
  and paint do not count.
- `pages.ts`: a list read page after page, 25 rows at a time, from `fetchMore` to
  the commit, by a real client over a real socket: without React (link), then
  through `useLiveSubscription` as `render.ts` renders it. Rows on screen is the
  commit that shows the page; All settled, the one where `fetchingMore` is false;
  both medians of the pages in the 500 rows before each size, and Worst the
  slowest of them. `applyLive` alone is timed on the list as it stands, for a page
  and for one row in 50 told again where it stands. On happy-dom, and no
  network latency.

## Runs

### 2026-11-05: a message costs what it changes

Same machine; Node 24.20.0; times in ms. `pages.ts`, 55 000 rows, Rows on screen,
before and after `applyLive` stopped scanning the list for each row of a message:

|  Rows | Link before | Link after | Virtual before | Virtual after | Memo before | Memo after | Every row before | Every row after |
| ----: | ----------: | ---------: | -------------: | ------------: | ----------: | ---------: | ---------------: | --------------: |
|   500 |        15.2 |       14.8 |           14.3 |          13.8 |        14.1 |       14.1 |             14.8 |            14.7 |
|  1000 |        14.2 |       13.3 |           14.3 |          13.4 |        14.6 |       13.5 |             15.7 |            15.4 |
|  2000 |        15.4 |       13.2 |           15.0 |          13.3 |        17.0 |       14.8 |             20.6 |            19.2 |
|  5000 |        19.2 |       14.0 |           19.3 |          14.5 |        23.8 |       18.2 |             36.7 |            32.8 |
| 10000 |        28.1 |       17.1 |           27.4 |          17.6 |        39.6 |       27.8 |             72.4 |            58.3 |
| 20000 |        39.0 |       22.7 |           39.7 |          23.8 |        62.6 |       46.7 |            146.4 |           125.9 |
| 50000 |       152.6 |       39.9 |          144.2 |          41.4 |       223.9 |      118.8 |            453.0 |           327.2 |

- At 50 000 rows `applyLive` takes 81.8 ms for a page before, 12.5 after, in the
  same run as the times above. The rest of the gain is not attributed.
- Before and after are two runs, not one process.
- Not measured: a browser's layout and paint, network latency, several clients.

### 2026-11-05: a big live list makes nobody wait (D-254)

Same machine; Node 24.20.0; times in ms. Caught up is how long messages kept
arriving after the last client opened.

`wire.ts`, 55 000 rows, compression on, nobody writing to the list:

|  Rows | Subscribers | One alone | All at once | Longest stall | Others wait | Update         | Author of 1 row in 50       | New first row  |
| ----: | ----------: | --------: | ----------: | ------------: | ----------: | -------------- | --------------------------- | -------------- |
|    25 |        1000 |        58 |        3490 |            87 |           - | 3 stmts, 223.6 | 5 stmts, 248.5, 1.6 KiB     | 3 stmts, 172.0 |
|  2000 |         100 |       297 |       12313 |           443 |  636 / 1323 | 3 stmts, 76.5  | 5 stmts, 281.7, 61.6 KiB    | 3 stmts, 67.4  |
| 10000 |          20 |      1371 |       16472 |           371 |    68 / 475 | 3 stmts, 61.9  | 5 stmts, 279.9, 308.0 KiB   | 3 stmts, 59.9  |
| 50000 |          20 |      6863 |      126272 |          1929 |   56 / 1960 | 3 stmts, 62.5  | 5 stmts, 1126.0, 1541.7 KiB | 3 stmts, 59.9  |

The same with `--busy`, an author the list shows written all along the opening:

|  Rows | Subscribers | All at once | Longest stall | Others wait | Caught up | Update        |
| ----: | ----------: | ----------: | ------------: | ----------: | --------: | ------------- |
|  2000 |         100 |       15613 |           557 |   57 / 1390 |       809 | 3 stmts, 75.1 |
| 10000 |          20 |       23647 |           774 |   61 / 1534 |       374 | 3 stmts, 62.6 |
| 50000 |          20 |      208198 |          6992 |   58 / 6996 |    227883 | 3 stmts, 61.9 |

Before this decision, 10 000 rows and 20 subscribers with `--busy`: Others wait
773 / 11659, and an update's message 14 514 KiB, the whole window, against 1.6.
50 000 rows and 20 subscribers failed, Postgres killed for lack of memory.

`render.ts`, on happy-dom, so no layout and no paint:

|  Rows | Rendered  | First message | Update p50 | Row gone | Rows rendered by an update |
| ----: | --------- | ------------: | ---------: | -------: | -------------------------: |
|    25 | every row |          12.2 |       0.28 |      1.5 |                         25 |
|    25 | memo      |           4.8 |       0.16 |      0.2 |                          1 |
|    25 | virtual   |           4.1 |       0.17 |      0.3 |                         25 |
|  2000 | every row |         128.6 |       3.14 |      3.7 |                       2000 |
|  2000 | memo      |         105.3 |       0.68 |      1.0 |                          1 |
|  2000 | virtual   |          61.1 |       0.16 |      0.7 |                         30 |
| 10000 | every row |         840.9 |      27.08 |     19.2 |                      10000 |
| 10000 | memo      |         839.4 |       4.02 |      5.8 |                          1 |
| 10000 | virtual   |         245.0 |       0.31 |      0.9 |                         30 |
| 50000 | every row |       10665.7 |     102.23 |    119.4 |                      50000 |
| 50000 | memo      |       10649.4 |      21.77 |     27.4 |                          1 |
| 50000 | virtual   |        1387.7 |       2.01 |      3.8 |                         30 |

`hook.ts`, a row gone from 50 000 rows: 125.3 ms before, 3.5 ms after.

### 2026-11-05: a live list costs what its readers see (D-252)

Same machine; Node 24.20.0; times in ms.

`lists.ts`, 55 000 rows, each with an author and 8 attachments:

|  Rows | Subscribers | Subscribe each | KiB a subscriber | Bytes a row | First message MiB | Grow | Update        | Author of 1 row in 50 | New first row |
| ----: | ----------: | -------------: | ---------------: | ----------: | ----------------: | ---: | ------------- | --------------------- | ------------- |
|    25 |         100 |            5.0 |               16 |         669 |              0.03 |  7.0 | 3 stmts, 58.5 | 4 stmts, 66.2         | 3 stmts, 58.2 |
|    25 |        1000 |            4.7 |               16 |         653 |              0.03 |  6.8 | 3 stmts, 80.2 | 4 stmts, 120.2        | 3 stmts, 74.6 |
|  2000 |          10 |          190.8 |              314 |         161 |              2.16 |  8.2 | 3 stmts, 55.8 | 4 stmts, 69.1         | 3 stmts, 56.0 |
| 10000 |           5 |          947.8 |             2025 |         207 |             10.82 | 10.0 | 3 stmts, 55.1 | 4 stmts, 91.2         | 3 stmts, 55.8 |
| 50000 |           5 |         4799.5 |             9396 |         192 |             54.17 | 20.9 | 3 stmts, 55.5 | 4 stmts, 213.9        | 3 stmts, 55.9 |

`rooms.ts`, 1000 viewers in 200 rooms of 5, 25 rows, subscribing in 5.8 ms each:

| Write          | Statements | Last message | Other rooms told |
| -------------- | ---------: | -----------: | ---------------: |
| update text    |          7 |         67.5 |                0 |
| update author  |          8 |         74.0 |                0 |
| new attachment |          8 |         69.6 |                0 |
| new first row  |         12 |         71.4 |                0 |

`hook.ts`:

|  Rows | Read  | First message | Update p50 | Row gone |
| ----: | ----- | ------------: | ---------: | -------: |
|    25 | hook  |           6.6 |       0.09 |      0.9 |
|    25 | plain |           6.1 |       1.30 |      2.0 |
|  1000 | hook  |          37.8 |       0.08 |      2.5 |
|  1000 | plain |          56.7 |      25.63 |     36.9 |
| 10000 | hook  |         289.0 |       0.23 |     17.4 |
| 10000 | plain |         561.2 |     251.54 |    358.2 |
| 50000 | hook  |        1442.1 |       1.18 |    125.3 |
| 50000 | plain |        2943.6 |    2306.37 |   3170.8 |

- The gate holds: a write costs the same from 25 to 50 000 rows, 80 ms at 1000
  subscribers against the 160 ms objective, and a room of 5 takes about ten
  statements whoever else is connected.
- About 50 ms of each last message is the engine's flush delay, not work.
- What still grows with the list is its first read, its first message and its
  memory: 4.8 s, 54 MiB and 9.4 MiB a subscriber at 50 000 rows. A list that
  long is for few readers; 1000 of them would hold about 9 GB, extrapolated.
- An author shown on 1 row in 50 takes 214 ms at 50 000 rows with 5 subscribers,
  399 ms with 20, where 1000 rows show it. Where that time goes is not
  investigated.
- At 20 subscribers a window holds 201 bytes a row at 10 000 rows, 190 at 50 000.
  At 5 or 10 subscribers the heap's noise moves this figure by tens of bytes.
- A rule naming the viewer keeps one read per viewer of one list:
  `--rooms 1 --viewers 1000` costs 1002 statements and 536 ms for an update,
  2002 and 737 ms for a new first row, 1003 and 1190 ms for an author (D-252).
- `totalCount`, by a one-off script not in this folder, 100 subscribers on a
  window of 10 000: an insert past the window costs 2 statements and 63 ms under
  a rule not naming the viewer, 101 statements and 304 ms under one naming them.
- Not measured: React's rendering at scale, a table past 60 000 rows, 1000
  subscribers on a list of 50 000, `pg_notify` under concurrent writers, several
  instances.

### 2026-11-01: live reads planned once per caller, commit `7a2b89ce`

Same machine and settings as the run below; 20 writes of each kind a case
on windows of 25 rows, 5 on windows of 1000.

A flush now reads a list's rows from the plan its subscription made, its
read rules and `beforeFind` run once; a subscription reads its window with
one query, of the fields that place and show a row, and a window keeps each
row as its sort keys alone (D-195).

| Subscribers | Lists       | Window | Write  | Statements |   p50 |   p99 | Last message p50 | Connection | Subscription | Subscribe all |
| ----------: | ----------- | -----: | ------ | ---------: | ----: | ----: | ---------------: | ---------: | -----------: | ------------: |
|       10000 | one list    |     25 | update |        1–1 | 105.0 | 156.5 |            157.1 |        2.3 |         11.0 |        3479.2 |
|       10000 | one list    |     25 | insert |        1–1 | 114.0 | 177.1 |            175.4 |        2.3 |         11.0 |        3479.2 |
|       10000 | one list    |     25 | delete |        2–2 | 120.4 | 186.3 |            185.8 |        2.3 |         11.0 |        3479.2 |
|       10000 | one list    |   1000 | update |        1–1 | 111.4 | 168.6 |            169.6 |        2.3 |        163.2 |       28513.9 |
|       10000 | one list    |   1000 | insert |        1–1 | 130.8 | 211.1 |            211.8 |        2.3 |        163.2 |       28513.9 |
|       10000 | one list    |   1000 | delete |        2–2 | 144.1 | 231.1 |            232.1 |        2.3 |        163.2 |       28513.9 |
|       10000 | a list each |     25 | update |        1–1 |  87.5 |  89.7 |             87.7 |        2.1 |         10.8 |        3130.4 |
|       10000 | a list each |     25 | insert |        1–1 |  52.7 |  53.7 |             96.4 |        2.1 |         10.8 |        3130.4 |
|       10000 | a list each |     25 | delete |        2–2 |  87.9 |  89.8 |             87.9 |        2.1 |         10.8 |        3130.4 |
|       10000 | a list each |   1000 | update |        1–1 |  92.4 |  94.0 |             93.7 |        2.1 |        163.6 |       27927.5 |
|       10000 | a list each |   1000 | insert |        1–1 |  52.6 |  53.4 |            101.6 |        2.1 |        163.6 |       27927.5 |
|       10000 | a list each |   1000 | delete |        2–2 |  93.2 |  93.7 |             93.6 |        2.1 |        163.6 |       27927.5 |

Commit rate, 16 writers: 3117 updates/s without the feed, 2595 with it.

- 10 000 subscribers on one list of 25 rows hear of an update after 157 ms
  for the last, against 230 ms before; D-195 asks for 150.
- A subscription to 1000 rows holds 163 KiB, 167 B a row, against 305 KiB.
- 10 000 subscriptions to 1000 rows open in 28.5 s, against 54 s; D-195
  asks for 30.

### 2026-10-29: a window notes what it changes, commit `bb9610a7`

Same machine and settings as the run below.

A flush now finds a list's moves from the rows its writes changed, not from
a pass over every shown row before and after them.

| Subscribers | Lists       | Window | Write  | Statements |   p50 |   p99 | Last message p50 | Connection | Subscription | Subscribe all |
| ----------: | ----------- | -----: | ------ | ---------: | ----: | ----: | ---------------: | ---------: | -----------: | ------------: |
|        1000 | one list    |     25 | update |        1–1 |  62.7 |  75.5 |             71.9 |        4.1 |         13.3 |         729.4 |
|        1000 | one list    |     25 | insert |        1–1 |  64.6 |  81.1 |             75.2 |        4.1 |         13.3 |         729.4 |
|        1000 | one list    |     25 | delete |        2–2 |  67.1 |  86.6 |             78.9 |        4.1 |         13.3 |         729.4 |
|        1000 | one list    |   1000 | update |        1–1 |  66.3 |  88.9 |             78.4 |        1.8 |        305.0 |        5227.4 |
|        1000 | one list    |   1000 | insert |        1–1 |  65.4 |  78.2 |             77.2 |        1.8 |        305.0 |        5227.4 |
|        1000 | one list    |   1000 | delete |        2–2 |  74.3 | 107.3 |             92.0 |        1.8 |        305.0 |        5227.4 |
|        1000 | a list each |     25 | update |        1–1 |  56.9 |  58.1 |             57.5 |        1.8 |         11.4 |         662.0 |
|        1000 | a list each |     25 | insert |        1–1 |  53.3 |  54.3 |             58.8 |        1.8 |         11.4 |         662.0 |
|        1000 | a list each |     25 | delete |        2–2 |  58.1 |  59.5 |             58.1 |        1.8 |         11.4 |         662.0 |
|        1000 | a list each |   1000 | update |        1–1 |  57.0 |  58.0 |             57.2 |        1.9 |        305.4 |        4958.4 |
|        1000 | a list each |   1000 | insert |        1–1 |  53.2 |  54.4 |             59.0 |        1.9 |        305.4 |        4958.4 |
|        1000 | a list each |   1000 | delete |        2–2 |  58.8 |  60.1 |             58.9 |        1.9 |        305.4 |        4958.4 |
|       10000 | one list    |     25 | update |        1–1 | 142.1 | 229.1 |            230.2 |        1.9 |         11.3 |        5742.4 |
|       10000 | one list    |     25 | insert |        1–1 | 155.8 | 257.1 |            257.5 |        1.9 |         11.3 |        5742.4 |
|       10000 | one list    |     25 | delete |        2–2 | 165.6 | 274.3 |            275.2 |        1.9 |         11.3 |        5742.4 |
|       10000 | one list    |   1000 | update |        1–1 | 188.7 | 734.8 |            313.3 |        1.9 |        305.4 |       54236.2 |
|       10000 | one list    |   1000 | insert |        1–1 | 179.7 | 304.7 |            304.0 |        1.9 |        305.4 |       54236.2 |
|       10000 | one list    |   1000 | delete |        2–2 | 251.4 | 687.1 |            437.8 |        1.9 |        305.4 |       54236.2 |
|       10000 | a list each |     25 | update |        1–1 |  85.7 |  88.6 |             85.8 |        1.9 |         11.3 |        5468.2 |
|       10000 | a list each |     25 | insert |        1–1 |  53.3 |  54.1 |            104.9 |        1.9 |         11.3 |        5468.2 |
|       10000 | a list each |     25 | delete |        2–2 |  87.1 |  88.8 |             87.2 |        1.9 |         11.3 |        5468.2 |
|       10000 | a list each |   1000 | update |        1–1 |  92.9 |  94.5 |             94.3 |        1.9 |        305.4 |       50323.2 |
|       10000 | a list each |   1000 | insert |        1–1 |  53.5 |  54.3 |            112.7 |        1.9 |        305.4 |       50323.2 |
|       10000 | a list each |   1000 | delete |        2–2 |  95.1 |  96.6 |             95.1 |        1.9 |        305.4 |       50323.2 |

Commit rate, 16 writers: 3000 updates/s without the feed, 2621 with it.

- 10 000 subscribers on one list of 1000 rows hear of an update after 189 ms
  at the median, 313 ms for the last, against 2.1 s and 4.1 s before; the
  window's size no longer weighs on a write.
- What still grows with the subscribers on one list is each one's find
  pipeline, run as its caller: 10 000 of them on a list of 25 rows take
  230 ms for the last message, 1000 of them 72 ms.
- A subscription to 1000 rows still holds 305 KiB, and subscribing still
  reads the window once per subscriber, as a find does.

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
