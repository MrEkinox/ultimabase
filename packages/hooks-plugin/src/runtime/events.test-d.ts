import { expectTypeOf, test } from 'vitest'

import type { JsonObject } from '@ultimabase/core'

import type { HookContext, HookEventContract } from '../context/hook-context.js'
import { defineEvent, onEvent, type HookEventDefinition } from './events.js'

interface PostCreatedEvent extends JsonObject {
	readonly postId: string
}

test('defineEvent types the payload its emitters and consumers share', () => {
	const postCreated = defineEvent<PostCreatedEvent>('post.created')

	expectTypeOf(postCreated).toEqualTypeOf<
		HookEventContract<PostCreatedEvent>
	>()

	const emit = (context: HookContext): void => {
		context.emit(postCreated, { postId: 'post-1' })
		// @ts-expect-error -- Contract payloads retain their required properties.
		context.emit(postCreated, {})
		// @ts-expect-error -- Events are bound by value, never by name (ADR-0318).
		context.emit('post.created', { postId: 'post-1' })
	}

	void emit
})

test('onEvent types the consumed payload from the contract', () => {
	const postCreated = defineEvent<PostCreatedEvent>('post.created')
	const definition = onEvent(postCreated, ({ context, event }) => {
		expectTypeOf(event.payload).toEqualTypeOf<PostCreatedEvent>()
		expectTypeOf(event.name).toEqualTypeOf<string>()
		expectTypeOf(context).toEqualTypeOf<HookContext>()
	})

	expectTypeOf(definition).toEqualTypeOf<
		HookEventDefinition<PostCreatedEvent>
	>()

	// @ts-expect-error -- Event payload roots must remain portable JSON documents.
	defineEvent<Date>('invalid')
})
