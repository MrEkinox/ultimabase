# @ultimabase/hooks-plugin

Official lifecycle Hooks: field and schema Hooks in `.with({ hooks: … })`,
operation phases inside the transaction, after-commit work and typed events.

## Installation

```sh
npm install @ultimabase/hooks-plugin @ultimabase/core
```

`@ultimabase/core` is a peer dependency. The application also needs a database
plugin.

## Example

A typed event consumed after commit, from the tested
[`examples/hooks`](../../examples/hooks/README.md) application:

<!-- region ../../examples/hooks/src/events.ts#event -->

```ts
import { defineEvent, onEvent } from '@ultimabase/hooks-plugin'

import { sendMessage } from './effects.ts'

/** Emitted by a Hook when a post goes live; bound by value, not by name. */
export const postPublished = defineEvent<{ postId: string; title: string }>(
	'post.published',
)

/** Runs after the commit, without delaying the response. */
export const announcePost = onEvent(postPublished, ({ event }) =>
	sendMessage({
		to: 'subscribers',
		subject: `New post: ${event.payload.title}`,
	}),
)
```

<!-- endregion -->

## Documentation

- [Hooks](../../apps/website/content/docs/1.0.0/plugins/official/hooks.mdx)
- [Transactions](../../apps/website/content/docs/1.0.0/core/writing-data/transactions.mdx)
