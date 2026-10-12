import { afterEach, describe, expect, it, vi } from 'vitest'

import { plugin as createPlugin } from '../../plugins/plugin.js'
import { contributeOperation } from '../../plugins/plugin-command-contributions.js'
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
	const Base = UltimaBase.use(databasePlugin)
	const WithPolicy = policy === undefined ? Base : Base.use(policy)
	const Application = WithPolicy.use(operationPlugin)
	// The default console logger at `warn` (ADR-0313): the warning stays visible.
	const ultimabase = new Application({
		logLevel: 'warn',
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

	it.each([undefined, 'no-op', 'unrelated'] as const)(
		'exposes operations without an unverified-protection warning (%s policy, ADR-0325)',
		async (mode) => {
			const warning = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const ultimabase = await createFixture(
				mode === undefined ? undefined : createPolicyPlugin(mode),
			)
			try {
				expose(ultimabase, primaryTransport)
				expose(ultimabase, secondaryTransport)
				expect(warning).not.toHaveBeenCalled()
			} finally {
				await ultimabase.dispose()
			}
		},
	)

	it('rejects the removed uncertainty acknowledgement', async () => {
		const ultimabase = await createFixture()
		try {
			expect(() =>
				ultimabase.exposeOperations({
					acknowledgeUnverifiedProtection: true,
					operations: [diagnosticOperation],
					transport: primaryTransport,
				} as never),
			).toThrow(
				'operation transport exposure contains unknown key: acknowledgeUnverifiedProtection',
			)
		} finally {
			await ultimabase.dispose()
		}
	})
})
