import { expectTypeOf, test } from 'vitest'

import { onEvent } from './events.js'

test('onEvent preserves exact event names and payload contracts', () => {
	const definition = onEvent<'post.created', { readonly postId: string }>({
		name: 'post.created',
		handler: ({ context, event }) => {
			expectTypeOf(event.name).toEqualTypeOf<'post.created'>()
			expectTypeOf(event.payload).toEqualTypeOf<{
				readonly postId: string
			}>()
			expectTypeOf(context).toHaveProperty('query')
		},
	})

	expectTypeOf(definition.name).toEqualTypeOf<'post.created'>()
	expectTypeOf(definition.kind).toEqualTypeOf<'hook-event'>()

	// @ts-expect-error -- Event payload roots must remain portable JSON documents.
	onEvent<'invalid', Date>({ name: 'invalid', handler: () => undefined })
})
