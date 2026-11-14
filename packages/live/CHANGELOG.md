# @ultimabase/live

## 0.8.0

No changes in this release.

## 0.7.0

No changes in this release.

## 0.6.0

### Minor Changes

- a47bbc4: `useLiveSubscription` gives `fetchingMore`, true while a growth runs, and `fetchMore()` adds a page of the first page's size. A call during a growth is ignored, and a growth that fails goes to `error` and `onError` while the list goes on as it was. A message keeps the object of every row it did not change, so a row component in `memo` renders only the rows that did.

### Patch Changes

- a47bbc4: A storm of connections no longer fails. The server's connection queue holds 4096, and at most 8 connections open at once. A socket closed by a failure of the server now gets `1013`, which `graphql-ws` retries, where it got `4403`: `4403` now means refused, and only that. `liveFetch` reconnects at a random moment of its wait, so that clients cut together do not come back together.
- de9c1db: A live list resumed over Server-Sent Events no longer misses a change written while its connection was being cut. `liveFetch` resumes with the revision it last saw, as `Last-Event-ID`, and the server sends the window whole when that connection lost some of what it was written.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.0

### Minor Changes

- 4cfa855: A live list's `first` is bounded by `maxLive` only, over GraphQL and REST; `maxTake` bounds page mode. A refusal past `maxLive` carries `details: { limit, rows }`, which `LiveError.details` exposes, and a `fetchMore` refused past it rejects while the list goes on following its window as it was (D-186).

## 0.2.0

No changes in this release.

## 0.1.2

No changes in this release.

## 0.1.1

No changes in this release.

## 0.1.0

No changes in this release.
