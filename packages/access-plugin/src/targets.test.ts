import { describe, expect, it } from 'vitest'

import {
	defineFieldKindAccessTarget,
	readFieldKindAccessTarget,
} from './targets.js'

describe('Access field-kind targets', () => {
	it('retains one opaque namespaced field-kind selector', () => {
		const target = defineFieldKindAccessTarget('fixture.secure-text' as never)

		expect(readFieldKindAccessTarget(target)).toBe('fixture.secure-text')
		expect(Object.isFrozen(target)).toBe(true)
	})

	it('rejects unnamespaced and malformed field-kind names', () => {
		for (const kind of [
			'',
			'text',
			'.text',
			'fixture.',
			'fixture.secure text',
			null,
		] as const) {
			expect(() => defineFieldKindAccessTarget(kind as never)).toThrow(
				'Access field-kind target must be namespaced',
			)
		}
	})

	it('rejects structural lookalikes instead of trusting public properties', () => {
		for (const target of [
			null,
			'fixture.secure-text',
			{ kind: 'fixture.secure-text' },
		] as const) {
			expect(() => readFieldKindAccessTarget(target)).toThrow(
				'Access field-kind target must be created by defineFieldKindAccessTarget()',
			)
		}
	})
})
