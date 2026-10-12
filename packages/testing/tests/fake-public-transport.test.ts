import {
	FrameworkError,
	PluginError,
	type ApplicationOperationTransport,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { FakePublicOperationTransport } from '../src/plugins.js'

const request = {
	context: {} as never,
	input: {},
	operation: 'fixture.transport.operation',
	version: '1.0.0',
}

const createFake = (
	execute: () => Promise<unknown>,
): FakePublicOperationTransport =>
	new FakePublicOperationTransport({
		execute,
	} as unknown as ApplicationOperationTransport)

describe('FakePublicOperationTransport', () => {
	it('returns public success and declared error payloads', async () => {
		await expect(
			createFake(() => Promise.resolve({ accepted: true })).request(request),
		).resolves.toStrictEqual({ ok: true, result: { accepted: true } })

		const pluginError = new PluginError(
			'fixture.transport.rejected',
			'internal message',
			{ internalDetails: { secret: true }, publicMessage: 'Rejected.' },
		)
		await expect(
			createFake(() => Promise.reject(pluginError)).request(request),
		).resolves.toStrictEqual({
			error: {
				code: 'fixture.transport.rejected',
				message: 'Rejected.',
				retryable: false,
			},
			ok: false,
		})
	})

	it('uses safe framework payloads and collapses unknown diagnostics', async () => {
		const frameworkError = new FrameworkError(
			'PLUGIN_PROTOCOL_INCOMPATIBLE',
			'internal version diagnostic',
			{ publicMessage: 'Unsupported version.' },
		)
		await expect(
			createFake(() => Promise.reject(frameworkError)).request(request),
		).resolves.toMatchObject({
			error: {
				code: 'PLUGIN_PROTOCOL_INCOMPATIBLE',
				message: 'Unsupported version.',
			},
			ok: false,
		})
		await expect(
			createFake(() => Promise.reject(new Error('secret'))).request(request),
		).resolves.toStrictEqual({
			error: {
				code: 'INTERNAL_ERROR',
				message: 'The operation could not be completed.',
				retryable: false,
			},
			ok: false,
		})
	})
})
