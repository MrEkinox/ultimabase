import { expectTypeOf, test } from 'vitest'

import { extensionHandlerKey, type ExtensionHandlerKey } from '../index.js'

test('retains the extension scope in handler keys', () => {
	expectTypeOf(
		extensionHandlerKey('schema', 'fixture.permissions'),
	).toEqualTypeOf<'schema:fixture.permissions'>()
	expectTypeOf<'field:fixture.visibility'>().toExtend<ExtensionHandlerKey>()
	// @ts-expect-error -- Handler scope is restricted to schema extension scopes.
	extensionHandlerKey('object', 'fixture.permissions')
})
