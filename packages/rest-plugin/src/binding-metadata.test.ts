import { describe, expect, it } from 'vitest'

import {
	readRestErrorStatusMap,
	readRestOperationBindingMetadata,
} from './binding-metadata.js'

describe('REST operation public paths', () => {
	it('keeps paths optional and preserves exact public error statuses', () => {
		const errors = { 'fixture.rejected': 401 }
		const metadata = { errors, path: '/auth/sign-up' }
		const parsed = readRestOperationBindingMetadata(
			metadata,
			['fixture.rejected'],
			'fixture.login',
		)
		expect(parsed).toStrictEqual(metadata)
		expect(Object.isFrozen(parsed)).toBe(true)
		expect(Object.isFrozen(parsed.errors)).toBe(true)
		expect(
			readRestOperationBindingMetadata(
				{ errors },
				['fixture.rejected'],
				'fixture.login',
			),
		).toStrictEqual({ errors })
		// Schema mutation bindings retain their separate, exact error-only contract.
		expect(() =>
			readRestErrorStatusMap(
				metadata,
				['fixture.rejected'],
				'fixture.mutation',
			),
		).toThrow('exact error status metadata')
	})

	it.each([
		null,
		12,
		'',
		'/',
		'auth/login',
		'//auth/login',
		'/auth//login',
		'/auth/login/',
		'/auth/../login',
		'/auth/./login',
		'/auth/%6cogin',
		'/auth/login?x=1',
		'/auth/login#x',
		'/auth/{id}',
		'/auth/:id',
		'/auth/*',
		'/auth\\login',
		'/classes',
		'/classes/User/login',
		'/operations/example.login',
	])('rejects noncanonical, dynamic, or reserved path %j', (path) => {
		expect(() =>
			readRestOperationBindingMetadata(
				{ errors: {}, path },
				[],
				'fixture.login',
			),
		).toThrow('invalid public path')
	})

	it('rejects unknown metadata and incomplete mappings even with a valid path', () => {
		for (const metadata of [
			{ errors: {}, path: '/auth/login', method: 'GET' },
			{ path: '/auth/login' },
		]) {
			expect(() =>
				readRestOperationBindingMetadata(metadata, [], 'fixture.login'),
			).toThrow('exact error status metadata')
		}
		expect(() =>
			readRestOperationBindingMetadata(
				{ errors: {}, path: '/auth/login' },
				['fixture.rejected'],
				'fixture.login',
			),
		).toThrow('must map every declared public error')
	})
})
