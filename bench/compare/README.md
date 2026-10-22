# Comparison benchmark

Measures UltimaBase beside Prisma, Drizzle and raw `pg` (D-100): the round
trips and the time of the same cases, on the same PostgreSQL server, the same
tables and the same rows. Its tables feed the comparison the documentation
publishes, and point at what to optimize next.

## Running

This is a Yarn project of its own, outside the workspaces, so that Prisma
and Drizzle never enter the packages' dependencies. `yarn validate` neither
installs nor type-checks it.

```sh
cd bench/compare
yarn install
yarn generate
yarn typecheck
yarn bench [--runs 200] [--url postgres://…]
```

- The PostgreSQL server is `--url`, else `BENCH_DATABASE_URL`, else
  `localhost:54318`. Each contender works in a schema of its own, dropped at
  the end.
- Every contender gets the same rows first: 10 genres and 101 writers, each
  of 3 novels in 2 genres. UltimaBase creates its tables; the others get the
  same tables, with the same indexes, from `contender.ts`.
- Each case runs on every contender in turn: a tenth of `--runs` untimed,
  then `--runs` timed. The reads come first, on the rows above. What a run
  needs, such as the writer a delete removes, is made before its clock
  starts.
- The script prints three Markdown tables to paste below, with the date and
  the versions.

## The contenders

Each one writes the code its documentation shows, in its own file.

- `ultimabase.ts`: the models, as Master, so no access rule or hook runs.
- `prisma.ts`: Prisma Client through `@prisma/adapter-pg`, nested `connect`
  and `disconnect`, `$transaction`, `include`.
- `drizzle.ts`: node-postgres, `db.transaction` where a write takes two
  statements, the relational queries for reads.
- `sql.ts`: `pg` with hand-written SQL, one statement a case, the floor.

## What it counts

- Round trips: a proxy between the clients and PostgreSQL counts each query
  a client sends, a `Query` message or the `Sync` closing an extended-protocol
  query, so BEGIN and COMMIT count. Everyone pays it alike, and no library's
  own log decides its score.
- Times: each case's median and 95th percentile, in milliseconds, through
  the proxy.
- A cascade is `on delete cascade` in the database for the others;
  UltimaBase runs its own cascade (D-54), in the delete's statement when no
  hook runs (D-102).

## Runs

### 2026-10-22: the reference, 200 runs

Commit `6f991e61`. Node 24.20, PostgreSQL 18.6 in Docker on the same machine,
Intel i7-8700B, load average 2.4. Prisma 7.10.1, Drizzle 0.45.4, pg 8.23.1.

Round trips:

| Case                                      | UltimaBase | Prisma | Drizzle |  pg |
| ----------------------------------------- | ---------: | -----: | ------: | --: |
| read by id                                |          1 |      1 |       1 |   1 |
| read 10 writers, their novels and genres  |          1 |      3 |       1 |   1 |
| create                                    |          1 |      1 |       1 |   1 |
| create, a one and a many connected        |          1 |      7 |       4 |   1 |
| update by id                              |          1 |      1 |       1 |   1 |
| update, a many disconnected and connected |          4 |      8 |       5 |   1 |
| delete by id, one novel cascaded          |          5 |      1 |       1 |   1 |
| a transaction, two creates                |          4 |      4 |       4 |   1 |

Median, ms:

| Case                                      | UltimaBase | Prisma | Drizzle |   pg |
| ----------------------------------------- | ---------: | -----: | ------: | ---: |
| read by id                                |       0.61 |   0.61 |    0.54 | 0.41 |
| read 10 writers, their novels and genres  |       2.89 |   2.45 |    1.95 | 1.88 |
| create                                    |       0.79 |   0.60 |    0.50 | 0.42 |
| create, a one and a many connected        |       1.20 |   3.35 |    1.72 | 0.57 |
| update by id                              |       0.92 |   0.63 |    0.55 | 0.45 |
| update, a many disconnected and connected |       2.18 |   3.72 |    2.12 | 0.52 |
| delete by id, one novel cascaded          |       2.73 |   0.63 |    0.53 | 0.46 |
| a transaction, two creates                |       2.23 |   1.98 |    1.66 | 0.44 |

95th percentile, ms:

| Case                                      | UltimaBase | Prisma | Drizzle |   pg |
| ----------------------------------------- | ---------: | -----: | ------: | ---: |
| read by id                                |       0.74 |   0.78 |    0.66 | 0.47 |
| read 10 writers, their novels and genres  |       3.30 |   3.05 |    2.36 | 2.11 |
| create                                    |       1.00 |   0.72 |    0.59 | 0.55 |
| create, a one and a many connected        |       1.49 |   4.95 |    1.93 | 0.67 |
| update by id                              |       1.19 |   0.70 |    0.62 | 0.58 |
| update, a many disconnected and connected |       2.49 |   4.14 |    2.51 | 0.58 |
| delete by id, one novel cascaded          |       3.27 |   0.86 |    0.60 | 0.55 |
| a transaction, two creates                |       2.71 |   2.47 |    2.03 | 0.50 |

What it shows:

- A nested create is UltimaBase's best case: one statement, where Prisma
  takes 7 and Drizzle 4.
- A cascade costs 5 round trips against 1: UltimaBase reads and deletes in
  the application, the others let the database do it (D-54).
- A `many` disconnected and connected costs 4 against the floor's 1: the
  join table takes two statements, so a transaction (D-99).
- A one-statement case costs UltimaBase 0.2 to 0.45 ms more than Drizzle,
  and its nested read 0.9 ms more than the floor's, on the same round trips:
  time spent in the kernel or the SQL it builds.

### 2026-10-22: a join move, a cascade and a read-back in one statement, 200 runs

Commit `255675f6` (D-101 to D-103). Same machine and versions, load average
2.6.

Round trips:

| Case                                      | UltimaBase | Prisma | Drizzle |  pg |
| ----------------------------------------- | ---------: | -----: | ------: | --: |
| read by id                                |          1 |      1 |       1 |   1 |
| read 10 writers, their novels and genres  |          1 |      3 |       1 |   1 |
| create                                    |          1 |      1 |       1 |   1 |
| create, a one and a many connected        |          1 |      7 |       4 |   1 |
| update by id                              |          1 |      1 |       1 |   1 |
| update, a many disconnected and connected |          1 |      8 |       5 |   1 |
| delete by id, one novel cascaded          |          1 |      1 |       1 |   1 |
| a transaction, two creates                |          4 |      4 |       4 |   1 |

Median, ms:

| Case                                      | UltimaBase | Prisma | Drizzle |   pg |
| ----------------------------------------- | ---------: | -----: | ------: | ---: |
| read by id                                |       0.61 |   0.60 |    0.54 | 0.42 |
| read 10 writers, their novels and genres  |       2.93 |   2.49 |    2.08 | 1.88 |
| create                                    |       0.71 |   0.60 |    0.51 | 0.43 |
| create, a one and a many connected        |       1.22 |   3.41 |    1.77 | 0.57 |
| update by id                              |       0.80 |   0.64 |    0.56 | 0.46 |
| update, a many disconnected and connected |       1.16 |   3.80 |    2.16 | 0.53 |
| delete by id, one novel cascaded          |       0.95 |   0.65 |    0.54 | 0.47 |
| a transaction, two creates                |       2.12 |   2.02 |    1.69 | 0.45 |

95th percentile, ms:

| Case                                      | UltimaBase | Prisma | Drizzle |   pg |
| ----------------------------------------- | ---------: | -----: | ------: | ---: |
| read by id                                |       0.78 |   0.77 |    0.65 | 0.52 |
| read 10 writers, their novels and genres  |       3.28 |   3.01 |    2.50 | 2.19 |
| create                                    |       0.87 |   0.70 |    0.61 | 0.49 |
| create, a one and a many connected        |       1.89 |   4.23 |    2.13 | 0.69 |
| update by id                              |       1.01 |   0.74 |    0.66 | 0.53 |
| update, a many disconnected and connected |       1.41 |   4.65 |    2.44 | 0.62 |
| delete by id, one novel cascaded          |       1.20 |   0.84 |    0.61 | 0.57 |
| a transaction, two creates                |       3.34 |   2.43 |    1.89 | 0.53 |

What it shows:

- Every case but the transaction now takes the floor's round trips; the
  transaction's 4 are BEGIN, two statements and COMMIT, as everyone's.
- A `many` moved is the fastest library: 1.16 ms against Drizzle's 2.16 and
  Prisma's 3.80.
- A cascade costs 0.95 ms against Drizzle's 0.54: one statement each, but
  UltimaBase checks the row and reads it back as it was.
- A single-row create or update still costs 0.2 ms more than Drizzle, and
  the nested read 0.85 ms more than Drizzle: time in the kernel or the SQL
  it builds, the next place to look.
