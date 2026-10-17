import { definePluginFieldFamily, stringField } from '@ultimabase/core'
import {
	contributeDeclarations,
	plugin as createPlugin,
	type PluginDefinition,
	type PluginEnvironmentClaim,
	type PluginPrivilege,
} from '@ultimabase/core/plugin'
import { describe, expect, it } from 'vitest'

import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	PluginConformanceError,
	runPluginConformance,
	type PluginConformanceInstanceFactory,
} from '../plugins.js'

// Plugin authors may write JavaScript: every public entry validates its
// input and names the exact problem (ADR-0327).
const callUntyped = (
	target: (...parameters: never[]) => unknown,
	...parameters: unknown[]
): unknown => Reflect.apply(target, undefined, parameters)

const subject = createPlugin({
	core: '^0.0.0',
	id: 'fixture.validation',
	version: '1.0.0',
	contributions: [],
})
const fieldFamily = definePluginFieldFamily({
	fieldKind: 'fixture.slug',
	builder: { name: 'slug', contexts: { stored: { factory: stringField } } },
})
// Requests one privilege and uses it to declare a field family.
const declaring = createPlugin({
	core: '^0.0.0',
	id: 'fixture.validation',
	version: '1.0.0',
	permissions: { 'schema:declare': 'Declares one field family.' },
	contributions: [
		contributeDeclarations({
			schema: ({ fields }) => fields.register(fieldFamily),
		}),
	],
})
const expected = {
	core: '^0.0.0',
	pluginId: 'fixture.validation',
	version: '1.0.0',
}
const createFixture = () => createPluginConformanceFixture({ subject })

/** Runs the suite and returns its conformance failure. */
const failConformance = async (
	options: Parameters<typeof definePluginConformanceSuite>[0],
): Promise<PluginConformanceError> => {
	const failure: unknown = await runPluginConformance(
		definePluginConformanceSuite(options),
	).catch((error: unknown) => error)
	if (!(failure instanceof PluginConformanceError)) {
		throw new TypeError('Expected a conformance failure', { cause: failure })
	}
	return failure
}

describe('createPluginConformanceFixture', () => {
	it.for([
		[
			'a plain object',
			null,
			'plugin conformance fixture must be a plain object',
		],
		[
			'a plugin subject',
			{ subject: { id: 'fixture.validation' } },
			'plugin conformance fixture subject must be a plugin',
		],
		[
			'a schema array',
			{ subject, schemas: 'Post' },
			'plugin conformance fixture schemas must be an array',
		],
		[
			'a support plugin array',
			{ subject, supportPlugins: subject },
			'plugin conformance fixture supportPlugins must be an array',
		],
		[
			'support distinct from the subject',
			{ subject, supportPlugins: [subject] },
			'plugin conformance fixture cannot repeat its subject as support',
		],
	] as const)('requires %s', ([, options, message]) => {
		expect(() => {
			callUntyped(createPluginConformanceFixture, options)
		}).toThrow(message)
	})

	it('installs support before the subject, with no schemas by default', () => {
		const support = createPlugin({
			core: '^0.0.0',
			id: 'fixture.support',
			version: '1.0.0',
			contributions: [],
		})
		const fixture = createPluginConformanceFixture({
			subject,
			supportPlugins: [support],
		})
		expect(fixture.plugins).toStrictEqual([support, subject])
		expect(fixture.schemas).toStrictEqual([])
		expect(Object.isFrozen(fixture)).toBe(true)
		expect(Object.isFrozen(fixture.plugins)).toBe(true)
		expect(createFixture().plugins).toStrictEqual([subject])
	})
})

describe('definePluginConformanceSuite validation', () => {
	it.for([
		['a plain object', null, 'plugin conformance suite must be a plain object'],
		[
			'a createFixture function',
			{ createFixture: 'fixture', expected },
			'plugin conformance createFixture must be a function',
		],
		[
			'expected facts',
			{ createFixture, expected: null },
			'plugin conformance expected facts must be a plain object',
		],
		[
			'a plugin ID',
			{ createFixture, expected: { ...expected, pluginId: '' } },
			'plugin conformance pluginId',
		],
		[
			'a version',
			{ createFixture, expected: { ...expected, version: 1 } },
			'plugin conformance version',
		],
		[
			'a Core range',
			{ createFixture, expected: { ...expected, core: undefined } },
			'plugin conformance Core range',
		],
		[
			'an instance factory',
			{ createFixture, expected, instances: { instanceIds: ['a', 'b'] } },
			'plugin conformance instances must expose create',
		],
		[
			'a first instance ID',
			{
				createFixture,
				expected,
				instances: { create: () => subject, instanceIds: ['', 'b'] },
			},
			'plugin conformance first instanceId',
		],
		[
			'a second instance ID',
			{
				createFixture,
				expected,
				instances: { create: () => subject, instanceIds: ['a'] },
			},
			'plugin conformance second instanceId',
		],
		[
			'distinct instance IDs',
			{
				createFixture,
				expected,
				instances: { create: () => subject, instanceIds: ['a', 'a'] },
			},
			'plugin conformance instanceIds must be distinct',
		],
	] as const)('requires %s', ([, options, message]) => {
		expect(() => {
			callUntyped(definePluginConformanceSuite, options)
		}).toThrow(message)
	})

	it('refuses unknown contracts and verifiers that are not functions', () => {
		const suite = definePluginConformanceSuite({ createFixture, expected })
		expect(() => {
			callUntyped(suite.check.bind(suite), 'telepathy', () => undefined)
		}).toThrow('Unknown optional conformance contract: telepathy')
		expect(() => {
			callUntyped(suite.check.bind(suite), 'operation', 'verify')
		}).toThrow('plugin conformance verifier must be a function')
	})

	it('keeps its own copy of the expected facts and instance IDs', () => {
		const privileges: PluginPrivilege[] = ['runtime:observe']
		const environment: PluginEnvironmentClaim[] = ['environment:network']
		const instanceIds: [string, string] = ['primary', 'audit']
		const instances: PluginConformanceInstanceFactory = {
			create: () => subject,
			instanceIds,
		}
		const suite = definePluginConformanceSuite({
			createFixture,
			expected: { ...expected, environment, privileges },
			instances,
		})
		privileges.push('schema:declare')
		environment.length = 0
		instanceIds[1] = 'primary'
		expect(suite.expected).toStrictEqual({
			...expected,
			environment: ['environment:network'],
			privileges: ['runtime:observe'],
		})
		expect(suite.instances?.instanceIds).toStrictEqual(['primary', 'audit'])
		expect(Object.isFrozen(suite.expected)).toBe(true)
	})
})

describe('runPluginConformance failures', () => {
	it.for([
		['plugin ID', { ...expected, pluginId: 'fixture.other' }],
		['plugin version', { ...expected, version: '2.0.0' }],
		['Core compatibility range', { ...expected, core: '^1.0.0' }],
		['plugin privileges', { ...expected, privileges: ['runtime:observe'] }],
		[
			'plugin environmental claims',
			{ ...expected, environment: ['environment:network'] },
		],
	] as const)(
		'names the manifest fact that differs: %s',
		async ([label, facts]) => {
			const failure = await failConformance({ createFixture, expected: facts })
			expect(failure.contract).toBe('manifest')
			expect(failure.pluginId).toBe(facts.pluginId)
			expect(failure.message).toBe(
				`Plugin "${facts.pluginId}" failed conformance contract "manifest".`,
			)
			expect(failure.cause).toStrictEqual(
				new TypeError(`${label} does not match the expected public contract`),
			)
		},
	)

	it('refuses a hand-built manifest that is not immutable', async () => {
		const unfrozen: PluginDefinition = {
			...subject,
			manifest: { ...subject.manifest },
		}
		const failure = await failConformance({
			createFixture: () =>
				createPluginConformanceFixture({ subject: unfrozen }),
			expected,
		})
		expect(failure.cause).toStrictEqual(
			new TypeError('plugin manifest must be immutable'),
		)
	})

	it('refuses a privilege requested without a reason', async () => {
		const unexplained: PluginDefinition = {
			...declaring,
			manifest: Object.freeze({
				...declaring.manifest,
				privileges: Object.freeze(
					declaring.manifest.privileges.map((request) =>
						Object.freeze({ ...request, reason: ' ' }),
					),
				),
			}),
		}
		const failure = await failConformance({
			createFixture: () =>
				createPluginConformanceFixture({ subject: unexplained }),
			expected,
		})
		expect(failure.cause).toStrictEqual(
			new TypeError('Privilege "schema:declare" needs a reason'),
		)
	})

	it.for([
		['instance plugin ID', 'fixture.other', '1.0.0', (id: string) => id],
		['instance ID', 'fixture.validation', '1.0.0', () => 'shared'],
		['instance version', 'fixture.validation', '2.0.0', (id: string) => id],
	] as const)(
		'names the instance fact that differs: %s',
		async ([label, id, version, readInstanceId]) => {
			const failure = await failConformance({
				createFixture,
				expected,
				instances: {
					create: (instanceId) =>
						createPlugin({
							core: '^0.0.0',
							id,
							instanceId: readInstanceId(instanceId),
							version,
							contributions: [],
						}),
					instanceIds: ['primary', 'audit'],
				},
			})
			expect(failure.contract).toBe('instance-identity')
			expect(failure.cause).toStrictEqual(
				new TypeError(`${label} does not match the expected public contract`),
			)
		},
	)

	it('snapshots the field builder methods a plugin declares', async () => {
		const report = await runPluginConformance(
			definePluginConformanceSuite({
				createFixture: () =>
					createPluginConformanceFixture({ subject: declaring }),
				expected: { ...expected, privileges: ['schema:declare'] },
			}),
		)
		expect(report.checks).toEqual(
			expect.arrayContaining([
				{ contract: 'privilege-denial', status: 'passed' },
				{ contract: 'static-determinism', status: 'passed' },
				{ contract: 'provenance', status: 'passed' },
			]),
		)
	})
})
