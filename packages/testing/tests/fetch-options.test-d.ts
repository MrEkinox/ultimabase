import { expectTypeOf, test } from 'vitest'
import type { TestApplication, TestFetchOptions } from '../src/index.js'

// ADR-0334 amendment: t.fetch passes 127.0.0.1 unless a test chooses its peer.
test('t.fetch takes an optional socket peer, or none', () => {
	expectTypeOf<TestFetchOptions>().toEqualTypeOf<{
		readonly remoteAddress?: string | undefined
	}>()
	expectTypeOf<TestApplication['fetch']>().toEqualTypeOf<
		(
			path: string,
			init?: RequestInit,
			options?: TestFetchOptions,
		) => Promise<Response>
	>()
	const options: TestFetchOptions = {
		// @ts-expect-error An address is a string.
		remoteAddress: 7,
	}
	void options
})
