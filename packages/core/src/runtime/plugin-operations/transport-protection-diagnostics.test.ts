import { afterEach, describe, expect, it, vi } from 'vitest'

import { plugin as createPlugin } from '../../plugins/plugin.js'
import { contributeOperation } from '../../plugins/plugin-operation-contributions.js'
import {
	defineOperation,
	defineOperationValue,
} from '../../plugins/plugin-operations.js'
import { UltimaBase } from '../application/ultima-base.js'
import { provideRuntimeConstraint } from '../capabilities.js'
import { protectedPolicy } from '../enforcement/protected-policy.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import {
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
} from './capabilities.js'

const emptyValue = defineOperationValue((value, path): null => {
	if (value !== null) throw new TypeError(`${path} must be null`)
	return null
})
const diagnosticOperation = defineOperation({
	input: emptyValue,
	name: 'fixture.transport-diagnostic.inspect',
	result: emptyValue,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})
const primaryTransport = defineOperationTransport({
	name: 'fixture.transport-diagnostic.primary',
	version: '1.0.0',
})
const secondaryTransport = defineOperationTransport({
	name: 'fixture.transport-diagnostic.secondary',
	version: '1.0.0',
})

const createBinding = (
	transport: typeof primaryTransport | typeof secondaryTransport,
) => {
	const codec = operationWireCodec({
		decode: (value: null) => value,
		encode: (value) => value,
		operation: diagnosticOperation,
		transport,
	})
	return operationTransportBinding({ codec, operation: diagnosticOperation })
}

const operationPlugin = createPlugin({
	core: '^0.0.0',
	id: 'fixture.transport-diagnostic.operations',
	permissions: {
		'operation:declare': 'Declares the diagnostic fixture operation.',
		'transport:expose': 'Binds the diagnostic fixture transports.',
	},
	version: '1.0.0',
	contributions: [
		contributeOperation({
			bindings: [
				createBinding(primaryTransport),
				createBinding(secondaryTransport),
			],
			execute: () => null,
			operation: diagnosticOperation,
		}),
	],
})

const databasePlugin = createPlugin({
	core: '^0.0.0',
	id: 'fixture.transport-diagnostic.database',
	version: '1.0.0',
	contributions: [
		provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
	],
})

const createPolicyPlugin = (mode: 'no-op' | 'unrelated') =>
	createPlugin({
		core: '^0.0.0',
		id: `fixture.transport-diagnostic.${mode}`,
		permissions: {
			'runtime:constrain': 'Exercises provider-presence diagnostics.',
		},
		version: '1.0.0',
		contributions: [
			provideRuntimeConstraint({
				contributionId: 'policy',
				create: () => ({
					value:
						mode === 'no-op'
							? protectedPolicy({ evaluate: () => undefined })
							: protectedPolicy({
									evaluate: () => ({ allowed: false }),
									operations: ['find-many'],
								}),
				}),
			}),
		],
	})

const createFixture = async (
	policy?: ReturnType<typeof createPolicyPlugin>,
) => {
	const ultimabase = new UltimaBase({
		pluginPrivileges: { logger: false },
		plugins:
			policy === undefined
				? [databasePlugin, operationPlugin]
				: [databasePlugin, policy, operationPlugin],
		schemas: [],
	})
	await ultimabase.start()
	return ultimabase
}

const expose = (
	ultimabase: Awaited<ReturnType<typeof createFixture>>,
	transport: typeof primaryTransport | typeof secondaryTransport,
): void => {
	ultimabase.exposeOperations({
		operations: [diagnosticOperation],
		transport,
	})
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('public transport protection diagnostics', () => {
	it('canonicalizes protocol identity and snapshots inert binding metadata', () => {
		const canonical = defineOperationTransport({
			name: primaryTransport.name,
			version: primaryTransport.version,
		})
		expect(canonical).toBe(primaryTransport)

		const metadata = { errors: { 'fixture.rejected': 409 } }
		const codec = operationWireCodec({
			decode: (value: null) => value,
			encode: (value) => value,
			operation: diagnosticOperation,
			transport: canonical,
		})
		const binding = operationTransportBinding({
			codec,
			metadata,
			operation: diagnosticOperation,
		})
		metadata.errors['fixture.rejected'] = 500
		expect(binding.metadata).toStrictEqual({
			errors: { 'fixture.rejected': 409 },
		})
		expect(Object.isFrozen(binding.metadata)).toBe(true)

		const circular: Record<string, null> = {}
		Reflect.set(circular, 'self', circular)
		expect(() =>
			operationTransportBinding({
				codec,
				metadata: circular,
				operation: diagnosticOperation,
			}),
		).toThrow('operation transport binding metadata')
	})

	it('reports absent providers once per protocol and isolates applications', async () => {
		const warning = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => undefined)
		const first = await createFixture()
		try {
			expose(first, primaryTransport)
			expose(first, primaryTransport)
			expose(first, secondaryTransport)
			expect(warning).toHaveBeenCalledWith(
				'[UltimaBase] Unverified public transport protection',
				{
					code: 'UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION',
					message:
						'Public transport protection is unverified because no protected policy contribution is installed.',
					policy: {
						coverage: 'unverified',
						providerPresence: 'none',
					},
					transport: {
						name: primaryTransport.name,
						version: primaryTransport.version,
					},
				},
			)
			expect(warning).toHaveBeenCalledTimes(2)
		} finally {
			await first.dispose()
		}

		warning.mockClear()
		const isolated = await createFixture()
		try {
			expose(isolated, primaryTransport)
			expect(warning).toHaveBeenCalledOnce()
		} finally {
			await isolated.dispose()
		}
	})

	it.each(['no-op', 'unrelated'] as const)(
		'reports %s provider presence without claiming coverage',
		async (mode) => {
			const warning = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const ultimabase = await createFixture(createPolicyPlugin(mode))
			try {
				expose(ultimabase, primaryTransport)
				expect(warning).toHaveBeenCalledWith(
					'[UltimaBase] Unverified public transport protection',
					expect.objectContaining({
						code: 'UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION',
						policy: {
							coverage: 'unverified',
							providerPresence: 'present',
						},
					}),
				)
			} finally {
				await ultimabase.dispose()
			}
		},
	)

	it('requires the exact uncertainty acknowledgement', async () => {
		const warning = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => undefined)
		const ultimabase = await createFixture()
		try {
			ultimabase.exposeOperations({
				acknowledgeUnverifiedProtection: true,
				operations: [diagnosticOperation],
				transport: primaryTransport,
			})
			expect(warning).not.toHaveBeenCalled()
			expect(() =>
				ultimabase.exposeOperations({
					acknowledgeUnverifiedProtection: false as never,
					operations: [diagnosticOperation],
					transport: primaryTransport,
				}),
			).toThrow(
				'operation transport acknowledgeUnverifiedProtection must be true when provided',
			)
			expect(() =>
				ultimabase.exposeOperations({
					acknowledgeUnprotected: true,
					operations: [diagnosticOperation],
					transport: primaryTransport,
				} as never),
			).toThrow(
				'operation transport exposure contains unknown key: acknowledgeUnprotected',
			)
		} finally {
			await ultimabase.dispose()
		}
	})
})
