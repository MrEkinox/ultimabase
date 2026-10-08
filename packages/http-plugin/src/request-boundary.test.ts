import { describe, expect, it } from 'vitest'

import {
	prepareHttpServerRequest,
	type HttpOriginalHeader,
} from './request-boundary.js'

// Regression for a reference defect (documented in docs/rebuild/DIFFERENCES.md):
// the reference `snapshotOriginalHeaders` validated `header[0]`/`header[1]` and
// then read the same slots again to build the snapshot (`header[0]` up to three
// times). A header pair whose index slots are accessors returning a valid
// string first and something else later could therefore retain a value that
// was never validated. The rebuild reads each slot once and keeps that value.

/** Builds a pair whose slot returns each answer in turn, recording every read. */
const forgedPair = (
	slot: 0 | 1,
	answers: readonly unknown[],
	other: string,
): Readonly<{ pair: HttpOriginalHeader; reads: unknown[] }> => {
	const reads: unknown[] = []
	const pair: HttpOriginalHeader =
		slot === 0 ? ['placeholder', other] : [other, 'placeholder']
	// Arrays cannot declare index accessors literally; `defineProperty` keeps a
	// real two-element array that passes the shape check.
	Object.defineProperty(pair, slot, {
		configurable: true,
		enumerable: true,
		get: (): unknown => {
			const value = answers[Math.min(reads.length, answers.length - 1)]
			reads.push(value)
			return value
		},
	})
	return { pair, reads }
}

describe('original header snapshot (reference defect regression)', () => {
	it('keeps the validated header value instead of re-reading its slot', () => {
		const { pair, reads } = forgedPair(1, ['validated', 42], 'x-forged')

		const prepared = prepareHttpServerRequest({
			originalHeaders: [pair],
			request: new Request('http://localhost/'),
		})

		// The reference retained the second read (the non-string 42).
		expect(prepared.originalHeaders).toStrictEqual([['x-forged', 'validated']])
		expect(reads).toStrictEqual(['validated'])
	})

	it('checks sensitive-header cardinality against the retained header name', () => {
		const { pair, reads } = forgedPair(
			0,
			['x-safe', 'Authorization', 'x-safe'],
			'Bearer forged',
		)

		const prepared = prepareHttpServerRequest({
			originalHeaders: [pair, ['Authorization', 'Bearer real']],
			request: new Request('http://localhost/'),
		})

		// The reference validated `x-safe`, stored `Authorization`, and checked
		// cardinality against `x-safe`, retaining two Authorization headers.
		expect(prepared.originalHeaders).toStrictEqual([
			['x-safe', 'Bearer forged'],
			['Authorization', 'Bearer real'],
		])
		expect(reads).toStrictEqual(['x-safe'])
	})
})
