import { expectTypeOf, test } from 'vitest'

import {
	assertNonEmptyString,
	assertNever,
	assertOptionalBoolean,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type Brand,
	type MaybePromise,
} from './index.js'

test('narrows untrusted runtime values through the public guards', () => {
	const recordInput: unknown = { enabled: true }
	const arrayInput: unknown = ['value']
	const nameInput: unknown = 'User'
	const flagInput: unknown = false

	if (isPlainRecord(recordInput)) {
		expectTypeOf(recordInput).toEqualTypeOf<Record<string, unknown>>()
	}

	if (isUnknownArray(arrayInput)) {
		expectTypeOf(arrayInput).toEqualTypeOf<readonly unknown[]>()
	}

	assertNonEmptyString(nameInput, 'name')
	assertOptionalBoolean(flagInput, 'flag')

	// Assertion functions retain precise values after an unknown boundary.
	expectTypeOf(nameInput).toEqualTypeOf<string>()
	expectTypeOf(flagInput).toEqualTypeOf<boolean | undefined>()
})

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

	expectTypeOf(values).toEqualTypeOf<readonly ['first', 'second']>()
	expectTypeOf(record).toEqualTypeOf<
		Readonly<{ kind: 'string'; required: true }>
	>()
})

test('accepts typed objects without requiring an index signature', () => {
	interface PluginConfig {
		enabled: boolean
	}

	const config: PluginConfig = { enabled: true }
	const immutable = immutableRecord(config)

	// Named configuration interfaces remain precise and become readonly.
	expectTypeOf(immutable).toEqualTypeOf<Readonly<PluginConfig>>()
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
