import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import { applicationFixture } from '../../tests/application-fixture.js'
import { FrameworkApplication } from '../application/framework-application.js'
import { Schema } from '../schema/schema/definition.js'
import {
	defineOperationTransport,
	operationHandler,
	operationTransportBinding,
	operationWireCodec,
	pluginOperationHandlerCapability,
	provideOperationHandler,
	provideOperationTransportBinding,
} from '../runtime/plugin-operations/capabilities.js'
import { readApplicationCommandGraph } from './application-command-graph.js'
import { definePlugin } from './definition.js'
import { defineOperation, defineOperationValue } from './plugin-operations.js'
import { defineSchemaMutation } from './plugin-schema-mutations.js'

const Document = Schema.define({
	className: 'CommandGraphDocument',
	fields: (field) => ({ title: field.string() }),
})
const value = defineOperationValue((candidate) => {
	if (typeof candidate !== 'string') throw new TypeError('Expected a string')
	return candidate
})
const transport = defineOperationTransport({
	name: 'fixture.command-graph.wire',
	version: '1.0.0',
})
const fixture = (instanceId = 'one') => {
	const operation = defineOperation({
		input: value,
		name: `fixture.command-graph.${instanceId}.echo`,
		result: value,
		target: 'application',
		transaction: 'forbidden',
		version: '1.0.0',
	})
	const mutation = defineSchemaMutation({
		authority: 'request',
		effect: 'update',
		input: value,
		name: `fixture.command-graph.${instanceId}.archive`,
		returning: 'after',
		select: { title: true },
		version: '1.0.0',
	})
	const privateMutation = defineSchemaMutation({
		authority: 'master',
		effect: 'delete',
		input: value,
		name: `fixture.command-graph.${instanceId}.purge`,
		returning: 'before',
		version: '1.0.0',
	})
	const execute = vi.fn(() => 'accepted')
	const cleanup = vi.fn()
	const create = vi.fn(() =>
		Promise.resolve({
			value: operationTransportBinding({
				operation,
				codec: operationWireCodec({
					operation,
					transport,
					decode: (candidate: string) => candidate,
					encode: (candidate) => candidate,
				}),
				metadata: { errors: {}, nested: ['inert'] },
			}),
			dispose: cleanup,
		}),
	)
	const handler = operationHandler({ operation, execute })
	const plugin = definePlugin({
		pluginId: 'fixture.command-graph.owner',
		instanceId,
		core: '^0.0.0',
		version: '1.0.0',
		privileges: [
			{
				name: 'operation:declare',
				reason: 'Declares the closed command kinds.',
			},
			{ name: 'model:extend', reason: 'Attaches schema and model aliases.' },
			{ name: 'transport:expose', reason: 'Owns an inert wire description.' },
		] as const,
		capabilities: {
			provides: [
				provideOperationHandler({
					contributionId: 'handler',
					create: () => ({ value: handler }),
				}),
				provideOperationTransportBinding({ contributionId: 'binding', create }),
			],
		},
		declare: ({ models, operations }) => {
			operations.declare(operation)
			operations.declare(mutation)
			operations.declare(privateMutation)
			// Surface order is deliberately different from declaration order.
			models.extend(Document, {
				contributionId: 'private',
				schemaMutations: {
					[`purge_${instanceId}`]: {
						mutation: privateMutation,
						surfaces: ['schema'],
					},
				},
			})
			models.extend(Document, {
				contributionId: 'public',
				schemaMutations: {
					[`archive_${instanceId}`]: {
						mutation,
						surfaces: ['schema', 'model'],
					},
				},
			})
		},
	})
	return {
		cleanup,
		create,
		execute,
		handler,
		mutation,
		operation,
		plugin,
		privateMutation,
	}
}

const fingerprint = (candidate: unknown): string =>
	createHash('sha256').update(JSON.stringify(candidate)).digest('hex')
const assertInert = (candidate: unknown): void => {
	expect(typeof candidate).not.toBe('function')
	if (candidate === null || typeof candidate !== 'object') return
	expect(Object.isFrozen(candidate)).toBe(true)
	expect(candidate).not.toBeInstanceOf(Map)
	for (const child of Object.values(candidate)) assertInert(child)
}

describe('canonical command graph', () => {
	it('compiles two inert kinds and stable derived aliases in contribution order', async () => {
		const owned = fixture()
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [Document],
				plugins: [owned.plugin],
				pluginPrivileges: { logger: false },
			}),
		)
		application.compileSchemas()
		const graph = readApplicationCommandGraph(application)
		expect(graph.commands.map(({ kind }) => kind)).toEqual([
			'operation',
			'mutation',
			'mutation',
		])
		assertInert(graph.commands)
		expect(graph.get(owned.operation.name)).toBe(
			graph.fromSource(owned.operation),
		)
		expect(graph.fromSource({ ...owned.operation })).toBeUndefined()
		expect(graph.operation(owned.operation.name)).toBe(
			application.getOperation(owned.operation.name),
		)
		const first = application.getSchemaSurface(Document.className)
		const second = application.getSchemaSurface(Document.className)
		if (first === undefined || second === undefined)
			throw new TypeError('Compiled surfaces are missing')
		expect([...first.schemaMutations.keys()]).toEqual([
			'purge_one',
			'archive_one',
		])
		expect(first.schemaMutations.get('archive_one')).toBe(
			second.modelMutations.get('archive_one'),
		)
		// Publicly reachable JS Maps are detached indexes, never mutable graph authority.
		if (first.schemaMutations instanceof Map) first.schemaMutations.clear()
		expect(
			application.getSchemaSurface(Document.className)?.schemaMutations.size,
		).toBe(2)
		expect(graph.get(owned.privateMutation.name)).toMatchObject({
			definition: {
				authority: 'master',
				effect: 'delete',
				returning: 'before',
			},
		})
		expect(owned.create).not.toHaveBeenCalled()
		await application.dispose()
		expect(() => {
			graph.bindings.materialize(pluginOperationHandlerCapability, [])
		}).toThrow('no longer available')
	})

	it('materializes once without changing static fingerprints and invalidates private bindings on disposal', async () => {
		const owned = fixture()
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [Document],
				plugins: [owned.plugin],
				pluginPrivileges: { logger: false },
			}),
		)
		application.compileSchemas()
		const graph = readApplicationCommandGraph(application)
		const before = fingerprint(graph.commands)
		expect(graph.bindings.handler(owned.operation)).toBeUndefined()
		await Promise.all([application.initialize(), application.initialize()])
		expect(owned.create).toHaveBeenCalledTimes(1)
		expect(graph.bindings.handler(owned.operation)).toMatchObject({
			kind: 'operation',
			execute: owned.execute,
		})
		const binding = graph.bindings.transport(owned.operation, transport)
		expect(binding?.binding.metadata).toEqual({ errors: {}, nested: ['inert'] })
		assertInert(binding?.binding.metadata)
		assertInert(graph.commands)
		expect(fingerprint(graph.commands)).toBe(before)
		await application.dispose()
		expect(owned.cleanup).toHaveBeenCalledTimes(1)
		expect(() => graph.bindings.handler(owned.operation)).toThrow(
			'no longer available',
		)
		expect(() => graph.bindings.transport(owned.operation, transport)).toThrow(
			'no longer available',
		)
	})

	it('keeps exact plugin instances distinct and fingerprints independent of executable closures', async () => {
		const first = fixture('first')
		const second = fixture('second')
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [Document],
				plugins: [first.plugin, second.plugin],
				pluginPrivileges: { logger: false },
			}),
		)
		application.compileSchemas()
		const graph = readApplicationCommandGraph(application)
		const equivalent = new FrameworkApplication({
			schemas: [Document],
			plugins: [fixture('first').plugin, fixture('second').plugin],
			pluginPrivileges: { logger: false },
		})
		equivalent.compileSchemas()
		expect(fingerprint(graph.commands)).toBe(
			fingerprint(readApplicationCommandGraph(equivalent).commands),
		)
		await equivalent.dispose()
		await application.initialize()
		expect(graph.bindings.handler(first.operation)?.owner.instanceId).toBe(
			'first',
		)
		expect(graph.bindings.handler(second.operation)?.owner.instanceId).toBe(
			'second',
		)
		expect(graph.bindings.handler(first.operation)).not.toBe(
			graph.bindings.handler(second.operation),
		)
	})

	it('publishes no command graph on a cross-kind name collision', () => {
		const owned = fixture()
		const collision = defineSchemaMutation({
			authority: 'request',
			effect: 'update',
			input: value,
			name: owned.operation.name,
			returning: 'after',
			version: '1.0.0',
		})
		const duplicate = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.command-graph.duplicate',
			version: '1.0.0',
			privileges: [
				{
					name: 'operation:declare',
					reason: 'Exercises atomic collision failure.',
				},
			] as const,
			declare: ({ operations }) => {
				operations.declare(collision)
			},
		})
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [Document],
				plugins: [owned.plugin, duplicate],
				pluginPrivileges: { logger: false },
			}),
		)
		expect(() => application.compileSchemas()).toThrow(
			'Duplicate plugin operation name',
		)
		expect(() => readApplicationCommandGraph(application)).toThrow(
			'have not been compiled',
		)
		expect(owned.create).not.toHaveBeenCalled()
	})

	it('rejects an entire binding batch atomically, including wrong instance and version', () => {
		const owned = fixture()
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [Document],
				plugins: [owned.plugin],
				pluginPrivileges: { logger: false },
			}),
		)
		application.compileSchemas()
		const graph = readApplicationCommandGraph(application)
		const contribution = {
			contributionId: 'first',
			owner: {
				pluginId: owned.plugin.manifest.identity.pluginId,
				instanceId: 'one',
			},
			pluginVersion: '1.0.0',
			value: owned.handler,
		}
		for (const invalid of [
			{ ...contribution, contributionId: 'duplicate' },
			{
				...contribution,
				owner: { ...contribution.owner, instanceId: 'foreign' },
			},
			{ ...contribution, pluginVersion: '2.0.0' },
			{ ...contribution, value: { ...owned.handler } },
		]) {
			expect(() => {
				graph.bindings.materialize(pluginOperationHandlerCapability, [
					contribution,
					invalid,
				])
			}).toThrow()
			expect(graph.bindings.handler(owned.operation)).toBeUndefined()
		}
		graph.bindings.materialize(pluginOperationHandlerCapability, [contribution])
		expect(graph.bindings.handler(owned.operation)).toMatchObject({
			execute: owned.execute,
		})
		expect(() => {
			graph.bindings.materialize(pluginOperationHandlerCapability, [
				contribution,
			])
		}).toThrow('already bound')
	})

	it('disposes already-created resources when a later binding fails before setup', async () => {
		const owned = fixture()
		const dispose = vi.fn()
		const setup = vi.fn()
		const foreign = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.command-graph.foreign',
			version: '1.0.0',
			privileges: [
				{
					name: 'transport:expose',
					reason: 'Exercises exact ownership rejection.',
				},
			] as const,
			capabilities: {
				provides: [
					provideOperationTransportBinding({
						contributionId: 'foreign-binding',
						create: async () => ({
							value: (await owned.create()).value,
							dispose,
						}),
					}),
				],
			},
			setup,
		})
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [Document],
				plugins: [owned.plugin, foreign],
				pluginPrivileges: { logger: false },
			}),
		)
		await expect(application.initialize()).rejects.toMatchObject({
			code: 'PLUGIN_OPERATION_INVALID',
			internalDetails: { kind: 'operation-transport-owner-invalid' },
		})
		expect(setup).not.toHaveBeenCalled()
		expect(dispose).toHaveBeenCalledTimes(1)
		expect(owned.cleanup).toHaveBeenCalledTimes(1)
		expect(() =>
			readApplicationCommandGraph(application).bindings.transport(
				owned.operation,
				transport,
			),
		).toThrow('no longer available')
	})
})
