# @ultimabase/testing

Testing utilities: `testApplication` for application tests, conformance suites
for plugin authors (`@ultimabase/testing/plugins`) and the Vitest configuration
(`@ultimabase/testing/vitest`).

## Installation

```sh
npm install --save-dev @ultimabase/testing vitest
```

`@ultimabase/core` is a peer dependency, and `vitest` an optional one.
PostgreSQL tests start a container with Docker or use `TEST_DATABASE_URL`.

## Example

A first application test, from the tested
[`examples/plugin-authoring`](../../examples/plugin-authoring/README.md)
application:

<!-- region ../../examples/plugin-authoring/tests/first.test.ts#first-test -->

```ts
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

it('creates a Post', async () => {
	await testApplication(ultimabase)
	const post = await Post.createOne({
		data: { title: 'Ship' },
		select: { archivedAt: true },
	})
	expect(post.archivedAt).toBeNull()
})
```

<!-- endregion -->

## Documentation

- [Test an Application](../../apps/website/content/docs/1.0.0/guides/test-an-application.mdx)
- [Build a Plugin](../../apps/website/content/docs/1.0.0/plugins/build-a-plugin/index.mdx)
- [Runtime and Infrastructure](../../apps/website/content/docs/1.0.0/plugins/build-a-plugin/runtime-and-infrastructure.mdx#verify-before-publishing)
