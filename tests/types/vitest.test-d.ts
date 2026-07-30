import { expectTypeOf, test } from 'vitest'

test('preserves literal unions in type assertions', () => {
	// This union proves that the type-test project keeps literal information intact.
	type ProjectKind = 'unit' | 'e2e' | 'types'

	expectTypeOf<ProjectKind>().toEqualTypeOf<'unit' | 'e2e' | 'types'>()
})
