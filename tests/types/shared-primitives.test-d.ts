import { expectTypeOf, test } from 'vitest'

import {
	assertNever,
	immutableArray,
	immutableRecord,
	type Brand,
	type MaybePromise,
} from '../../packages/shared/src/index.js'

test('keeps brands incompatible across typed boundaries', () => {
	type UserId = Brand<string, 'UserId'>
	type RoleId = Brand<string, 'RoleId'>

	// Brands retain their runtime primitive while preventing accidental interchange.
	expectTypeOf<UserId>().toExtend<string>()
	expectTypeOf<string>().not.toExtend<UserId>()
	expectTypeOf<UserId>().not.toExtend<RoleId>()
})

test('accepts synchronous values and promise-like results', () => {
	expectTypeOf<MaybePromise<number>>().toEqualTypeOf<
		number | PromiseLike<number>
	>()
})

test('preserves literal information in immutable collections', () => {
	const values = immutableArray(['first', 'second'] as const)
	const record = immutableRecord({ kind: 'string', required: true } as const)

	expectTypeOf(values).toEqualTypeOf<readonly ('first' | 'second')[]>()
	expectTypeOf(record).toEqualTypeOf<
		Readonly<{ kind: 'string'; required: true }>
	>()
})

test('enforces exhaustive discriminated-union handling', () => {
	type Variant = { kind: 'first' } | { kind: 'second' }
	const visit = (variant: Variant): string => {
		switch (variant.kind) {
			case 'first':
				return 'first'
			case 'second':
				return 'second'
			default:
				return assertNever(variant)
		}
	}

	expectTypeOf(visit).toEqualTypeOf<(variant: Variant) => string>()
	expectTypeOf(assertNever).toEqualTypeOf<(value: never) => never>()
})
