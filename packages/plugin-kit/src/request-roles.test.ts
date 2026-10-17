import {
	FrameworkError,
	RequestSubjectReference,
	runWithRequestEngine,
	UltimaBase,
} from '@ultimabase/core'
import { anonymous, plugin, provideCapability } from '@ultimabase/core/plugin'
import { describe, expect, it, onTestFinished } from 'vitest'

import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../../tooling/vitest/test-database.js'
import {
	requestRoleResolverCapability,
	requireCurrentRequestRoleResolver,
	resolveRequestRoleReference,
	type RequestRoleReference,
	type RequestRoleResolutionInput,
	type RequestRoleResolver,
} from './index.js'

// The role contract left Core for plugin-kit (ADR-0329).
describe('resolveRequestRoleReference', () => {
	it('accepts direct references only', () => {
		const reference = new RequestSubjectReference('role', 'editor')

		expect(resolveRequestRoleReference(reference)).toBe(reference)
	})

	it('rejects value carriers and non-string role identities', () => {
		// Role results are plain data without a reference method (ADR-0310).
		expect(() =>
			resolveRequestRoleReference({
				toRequestRoleReference: () => new RequestSubjectReference('role', 'x'),
			} as never),
		).toThrow(
			new TypeError(
				'Request role subject must provide one string role reference',
			),
		)
		expect(() =>
			resolveRequestRoleReference(
				new RequestSubjectReference('role', 42) as never,
			),
		).toThrow(
			new TypeError(
				'Request role subject must provide one string role reference',
			),
		)
	})
})

describe('requestRoleResolverCapability', () => {
	it('keeps its protocol identity and a hint that names no plugin package', () => {
		expect(requestRoleResolverCapability.capabilityId).toBe(
			'ultimabase.request-subject.role-resolver',
		)
		expect(requestRoleResolverCapability.version).toBe('1.0.0')
		expect(requestRoleResolverCapability.hint).toEqual(expect.any(String))
		expect(requestRoleResolverCapability.hint).not.toMatch(
			/@ultimabase\/|-plugin\b|[a-z]+Plugin\(/u,
		)
	})
})

/** A resolver whose methods read their own state through `this`. */
class FixtureRoleResolver implements RequestRoleResolver {
	readonly calls: string[] = []
	readonly #editor = new RequestSubjectReference('role', 'Role:editor')

	hasRole({ role }: RequestRoleResolutionInput): boolean {
		this.calls.push(`hasRole:${role.value}`)
		return role.value === 'editor'
	}

	resolvePersistentRole({
		role,
	}: RequestRoleResolutionInput): RequestRoleReference | undefined {
		this.calls.push(`resolvePersistentRole:${role.value}`)
		return role.value === 'editor' ? this.#editor : undefined
	}

	resolveCurrentRoles(): readonly RequestRoleReference[] {
		this.calls.push('resolveCurrentRoles')
		return [this.#editor]
	}
}

const startWith = async (resolver?: RequestRoleResolver) => {
	const contributions =
		resolver === undefined
			? []
			: [
					provideCapability(requestRoleResolverCapability, {
						contributionId: 'roles',
						create: () => ({ value: resolver }),
					}),
				]
	const ultimabase = new (UltimaBase.use(
		testDatabasePlugin(new ScriptedTestDatabase(), { id: 'fixture.database' }),
		plugin({
			core: '^0.0.0',
			id: 'fixture.role-resolver',
			version: '1.0.0',
			contributions,
		}),
	))({ logger: false, schemas: [] })
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	const engine = anonymous(ultimabase, { requestId: 'r1', source: 'fixture' })
	return {
		context: engine.context,
		inRequest: <TResult>(callback: () => TResult) =>
			runWithRequestEngine(engine, callback),
	}
}

describe('requireCurrentRequestRoleResolver', () => {
	it('names the missing capability and how to add one', async () => {
		const { inRequest } = await startWith()
		let failure: unknown
		try {
			inRequest(() => requireCurrentRequestRoleResolver())
		} catch (error: unknown) {
			failure = error
		}
		expect(failure).toBeInstanceOf(FrameworkError)
		expect(failure).toMatchObject({
			code: 'PLUGIN_CAPABILITY_MISSING',
			message:
				'Active application requires a request role resolver capability. Add a plugin that resolves request roles to UltimaBase.use(...).',
		})
	})

	it('calls the provider through one stable attributed resolver', async () => {
		const resolver = new FixtureRoleResolver()
		const { context, inRequest } = await startWith(resolver)
		const editor = new RequestSubjectReference('role', 'editor')
		const viewer = new RequestSubjectReference('role', 'viewer')
		const results = await inRequest(async () => {
			const attributed = requireCurrentRequestRoleResolver()
			expect(requireCurrentRequestRoleResolver()).toBe(attributed)
			expect(Object.isFrozen(attributed)).toBe(true)
			return {
				hasEditor: await attributed.hasRole({ context, role: editor }),
				hasViewer: await attributed.hasRole({ context, role: viewer }),
				persistent: await attributed.resolvePersistentRole?.({
					context,
					role: editor,
				}),
				unknown: await attributed.resolvePersistentRole?.({
					context,
					role: viewer,
				}),
				current: await attributed.resolveCurrentRoles?.({ context }),
			}
		})
		expect(results).toStrictEqual({
			current: [new RequestSubjectReference('role', 'Role:editor')],
			hasEditor: true,
			hasViewer: false,
			persistent: new RequestSubjectReference('role', 'Role:editor'),
			unknown: undefined,
		})
		expect(resolver.calls).toStrictEqual([
			'hasRole:editor',
			'hasRole:viewer',
			'resolvePersistentRole:editor',
			'resolvePersistentRole:viewer',
			'resolveCurrentRoles',
		])
	})

	it('exposes only the optional methods the provider implements', async () => {
		const { context, inRequest } = await startWith({ hasRole: () => true })
		const attributed = inRequest(() => requireCurrentRequestRoleResolver())
		expect(Object.keys(attributed)).toStrictEqual(['hasRole'])
		expect(
			await inRequest(() =>
				attributed.hasRole({
					context,
					role: new RequestSubjectReference('role', 'any'),
				}),
			),
		).toBe(true)
	})
})
