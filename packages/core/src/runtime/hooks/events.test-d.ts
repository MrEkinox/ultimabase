import { expectTypeOf, test } from 'vitest'

import type { HookContext, JsonObject } from '../../schema/index.js'
import { defineEvent, onEvent } from './events.js'

interface PostCreatedEvent extends JsonObject {
	readonly postId: string
}

test('defineEvent preserves payload, name, and delivery semantics', () => {
	const optionalEvent = defineEvent<PostCreatedEvent>()('post.created', {
		delivery: 'optional',
	})

	expectTypeOf(optionalEvent.name).toEqualTypeOf<'post.created'>()
	expectTypeOf(optionalEvent.delivery).toEqualTypeOf<'optional'>()

	const emit = (context: HookContext): void => {
		context.emit(optionalEvent, { postId: 'post-1' })
		// @ts-expect-error -- Contract payloads retain their required properties.
		context.emit(optionalEvent, {})
		// Legacy names deliberately keep accepting portable JSON payloads.
		context.emit('legacy.required', {})
	}

	void emit
})

test('onEvent preserves exact event names and payload contracts', () => {
	const definition = onEvent<'post.created', { readonly postId: string }>({
		name: 'post.created',
		handler: ({ context, event }) => {
			expectTypeOf(event.name).toEqualTypeOf<'post.created'>()
			expectTypeOf(event.payload).toEqualTypeOf<{
				readonly postId: string
			}>()
			expectTypeOf(context).not.toHaveProperty('query')
		},
	})

	expectTypeOf(definition.name).toEqualTypeOf<'post.created'>()
	expectTypeOf(definition.kind).toEqualTypeOf<'hook-event'>()

	// @ts-expect-error -- Event payload roots must remain portable JSON documents.
	onEvent<'invalid', Date>({ name: 'invalid', handler: () => undefined })
})
