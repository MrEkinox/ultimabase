import { expect, it } from 'vitest'

import { Book } from '../src/catalog.ts'
import { ultimabase } from '../src/ultimabase.ts'

// This region is shown in the Core README; the assertions after it prove what
// the README says about compilation.

it('compiles the schema graph without starting anything', () => {
	//#region compile
	// Pure: no plugin setup, no connection, no active-application slot.
	const compiled = ultimabase.compile()
	//#endregion compile

	expect(compiled.schemas.size).toBe(4)
	expect(compiled.schemas.get('Book')).toBe(Book)
	expect(ultimabase.compile()).toBe(compiled)
	expect(ultimabase.state).toBe('idle')
})
