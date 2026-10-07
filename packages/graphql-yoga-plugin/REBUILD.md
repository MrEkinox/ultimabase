# `@ultimabase/graphql-yoga-plugin` rebuild notes (work in progress)

Reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`, branch
`rebuild/small-plugins-a` (base `953e832`).

Checkpoint: Yoga plugin factories inlined into one typed list, parse and
validation failures built through `createGraphqlHttpFailure`, shared
`tooLarge()` failure in `body.ts`, dead `undefined` options branch removed.
Final notes, measurements and validation results follow in the final commit.
