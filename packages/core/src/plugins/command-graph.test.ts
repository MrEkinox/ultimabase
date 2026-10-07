import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import { applicationFixture } from '../../tests/application-fixture.js'
import { FrameworkApplication } from '../application/framework-application.js'

import {
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
} from '../runtime/plugin-operations/capabilities.js'
import { readApplicationKernelState } from '../application/application-kernel-state.js'
import {
	readMutationCommand,
	readOperationCommand,
	type CompiledCommandGraph,
	type CommandSource,
	type CompiledCommand,
} from './command-graph.js'
import { plugin as createPlugin } from './plugin.js'
import {
	contributeDeclarations,
	contributeApplication,
} from './plugin-contributions.js'
import {
	contributeOperation,
	contributeOperationBinding,
} from './plugin-command-contributions.js'

import { defineOperation, defineOperationValue } from './plugin-operations.js'
import { defineSchemaMutation } from './plugin-schema-mutations.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'

// Runtime readers accept only canonical graph records; source tokens bind once.
const requireCommand = (
	graph: CompiledCommandGraph,
	source: CommandSource,
): CompiledCommand => {
	const command = graph.fromSource(source)
	if (command === undefined)
		throw new TypeError('Fixture command is unavailable')
	return command
}

const Document = UltimaBase.Schema.define({
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
	const binding = operationTransportBinding({
		operation,
		codec: operationWireCodec({
			operation,
			transport,
			decode: (candidate: string) => candidate,
			encode: (candidate) => candidate,
		}),
		metadata: { errors: {}, nested: ['inert'] },
	})
	const create = vi.fn(() => Promise.resolve({ execute, dispose: cleanup }))
	const plugin = createPlugin({
		id: 'fixture.command-graph.owner',
		instanceId,
		core: '^0.0.0',
		version: '1.0.0',
		permissions: {
			'operation:declare': 'Declares the closed command kinds.',
			'model:extend': 'Attaches schema and model aliases.',
			'transport:expose': 'Owns an inert wire description.',
		},
		contributions: [
			contributeOperation({ bindings: [binding], create, operation }),
			contributeDeclarations({
				operations: ({ operations }) => {
					operations.declare(mutation)
					operations.declare(privateMutation)
					return undefined
				},
				models: ({ models }) => {
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
					return undefined
				},
			}),
		],
	})
	return {
		cleanup,
		create,
		execute,
		binding,
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
	it('derives inert tooling and direct surfaces from the same commands', () => {
		const owned = fixture()
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [Document],
				plugins: [owned.plugin],
				pluginPrivileges: { logger: false },
			}),
		)
		application.compileSchemas()
		const graph = readApplicationKernelState(application).commands
		const inspection = application.typegenGraph
		const operation = inspection.operations[0]?.operation
		expect(operation).toBe(graph.get(owned.operation.name)?.definition)
		expect(operation).not.toBe(owned.operation)
		assertInert(inspection.operations)
		const surface = inspection.schemaSurfaces[0]
		if (surface === undefined) throw new Error('Missing inspection surface')
		expect(surface.schema).toEqual({ className: Document.className })
		assertInert(surface.schema)
		const direct = application.getSchemaSurface(Document.className)
		expect(direct?.schema).toBe(Document)
		expect([...surface.schemaMutations.keys()]).toEqual([
			'purge_one',
			'archive_one',
		])
		for (const [name, command] of surface.schemaMutations) {
			assertInert(command)
			expect(command).toBe(direct?.schemaMutations.get(name))
			expect(command.mutation).toBe(
				graph.get(command.mutation.name)?.definition,
			)
		}
		expect(surface.modelMutations.get('archive_one')).toBe(
			surface.schemaMutations.get('archive_one'),
		)
		// An untyped tooling consumer can only mutate its detached lookup indexes.
		if (surface.schemaMutations instanceof Map) surface.schemaMutations.clear()
		expect(
			application.typegenGraph.schemaSurfaces[0]?.schemaMutations.size,
		).toBe(2)
		expect(direct?.schemaMutations.size).toBe(2)
		expect(owned.create).not.toHaveBeenCalled()
	})

	it('keeps snapshot callbacks private and rejects foreign command identities', async () => {
		const owned = fixture()
		const applications = [0, 1].map(() =>
			applicationFixture(
				new FrameworkApplication({
					schemas: [Document],
					plugins: [owned.plugin],
					pluginPrivileges: { logger: false },
				}),
			),
		)
		const graphs = applications.map((application) => {
			application.compileSchemas()
			return readApplicationKernelState(application).commands
		})
		const [first, second] = graphs
		if (first === undefined || second === undefined)
			throw new Error('Missing fixture graph')
		const view = first.operation(owned.operation.name)
		if (view === undefined) throw new Error('Missing fixture operation')
		const { command, graph } = readOperationCommand(view)
		expect(graph).toBe(first)
		expect(command).toBe(first.fromSource(owned.operation))
		expect(first.snapshotInput(command, 'payload')).toBe('payload')
		expect(first.snapshotOperationResult(command, 'result')).toBe('result')
		expect(() => first.snapshotInput(command, 42)).toThrow('Expected a string')
		// Same nominal token and owner in another pure compilation confer no authority.
		expect(() => second.snapshotInput(command, 'payload')).toThrow(
			'another compiled graph',
		)
		expect(second.bindings.handler(command)).toBeUndefined()
		expect(() => readOperationCommand({ ...view })).toThrow(
			'not compiled by Core',
		)
		const mutationView = first
			.schemaSurface(Document.className)
			?.schemaMutations.get('archive_one')
		if (mutationView === undefined) throw new Error('Missing mutation fixture')
		const mutation = readMutationCommand(mutationView)
		expect(mutation.graph).toBe(first)
		expect(mutation.command).toBe(first.fromSource(owned.mutation))
		expect(first.snapshotInput(mutation.command, 'reason')).toBe('reason')
		expect(() => second.snapshotInput(mutation.command, 'reason')).toThrow(
			'another compiled graph',
		)
		expect(() => readMutationCommand({ ...mutationView })).toThrow(
			'not compiled by Core',
		)
		assertInert(command)
		expect(owned.create).not.toHaveBeenCalled()
		for (const application of applications) await application.dispose()
	})

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
		const graph = readApplicationKernelState(application).commands
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
			graph.bindings.bindHandlers([])
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
		const graph = readApplicationKernelState(application).commands
		const command = requireCommand(graph, owned.operation)
		const before = fingerprint(graph.commands)
		expect(graph.bindings.handler(command)).toBeUndefined()
		await Promise.all([application.initialize(), application.initialize()])
		expect(owned.create).toHaveBeenCalledTimes(1)
		expect(graph.bindings.handler(command)).toMatchObject({
			kind: 'operation',
			execute: owned.execute,
		})
		// Shaped copies cannot address another private execution binding.
		expect(graph.bindings.handler({ ...command })).toBeUndefined()
		const binding = graph.bindings.transport(command, transport)
		expect(binding?.binding.metadata).toEqual({ errors: {}, nested: ['inert'] })
		assertInert(binding?.binding.metadata)
		assertInert(graph.commands)
		expect(fingerprint(graph.commands)).toBe(before)
		await application.dispose()
		expect(owned.cleanup).toHaveBeenCalledTimes(1)
		expect(() => graph.bindings.handler(command)).toThrow('no longer available')
		expect(() => graph.bindings.transport(command, transport)).toThrow(
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
		const graph = readApplicationKernelState(application).commands
		const firstCommand = requireCommand(graph, first.operation)
		const secondCommand = requireCommand(graph, second.operation)
		const equivalent = new FrameworkApplication({
			schemas: [Document],
			plugins: [fixture('first').plugin, fixture('second').plugin],
			pluginPrivileges: { logger: false },
		})
		equivalent.compileSchemas()
		expect(fingerprint(graph.commands)).toBe(
			fingerprint(readApplicationKernelState(equivalent).commands.commands),
		)
		await equivalent.dispose()
		await application.initialize()
		expect(graph.bindings.handler(firstCommand)?.owner.instanceId).toBe('first')
		expect(graph.bindings.handler(secondCommand)?.owner.instanceId).toBe(
			'second',
		)
		expect(graph.bindings.handler(firstCommand)).not.toBe(
			graph.bindings.handler(secondCommand),
		)
	})

	it('rejects a schema mutation alias that shadows an existing static member', () => {
		const mutation = defineSchemaMutation({
			authority: 'request',
			effect: 'update',
			input: value,
			name: 'fixture.command-graph.reserved',
			returning: 'after',
			version: '1.0.0',
		})
		const reserved = createPlugin({
			core: '^0.0.0',
			id: 'fixture.command-graph.reserved',
			version: '1.0.0',
			permissions: {
				'model:extend': 'Exercises static schema member protection.',
				'operation:declare': 'Declares the colliding mutation.',
			},
			contributions: [
				contributeDeclarations({
					operations: ({ operations }) => {
						operations.declare(mutation)
						return undefined
					},
					models: ({ models }) => {
						models.extend(Document, {
							contributionId: 'reserved',
							schemaMutations: {
								className: { mutation, surfaces: ['schema'] },
							},
						})
						return undefined
					},
				}),
			],
		})
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [Document],
				plugins: [reserved],
				pluginPrivileges: { logger: false },
			}),
		)

		expect(() => application.compileSchemas()).toThrow(
			'Reserved schema static mutation: className',
		)
		expect(() => readApplicationKernelState(application).commands).toThrow(
			'have not been compiled',
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
		const duplicate = createPlugin({
			core: '^0.0.0',
			id: 'fixture.command-graph.duplicate',
			version: '1.0.0',
			permissions: {
				'operation:declare': 'Exercises atomic collision failure.',
			},
			contributions: [
				contributeDeclarations({
					operations: ({ operations }) => {
						operations.declare(collision)

						return undefined
					},
				}),
			],
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
		expect(() => readApplicationKernelState(application).commands).toThrow(
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
		const graph = readApplicationKernelState(application).commands
		const command = requireCommand(graph, owned.operation)
		const contribution = {
			contributionId: 'first',
			owner: {
				kind: 'plugin' as const,
				pluginId: owned.plugin.manifest.identity.pluginId,
				instanceId: 'one',
				version: '1.0.0',
			},
			resource: { execute: owned.execute, kind: 'operation' as const },
			source: owned.operation,
		}
		for (const invalid of [
			{ ...contribution, contributionId: 'duplicate' },
			{
				...contribution,
				owner: { ...contribution.owner, instanceId: 'foreign' },
			},
			{ ...contribution, owner: { ...contribution.owner, version: '2.0.0' } },
			{
				...contribution,
				resource: { kind: 'mutation' as const, resolve: () => undefined },
			},
		]) {
			expect(() => {
				graph.bindings.bindHandlers([contribution, invalid])
			}).toThrow()
			expect(graph.bindings.handler(command)).toBeUndefined()
		}
		graph.bindings.bindHandlers([contribution])
		expect(graph.bindings.handler(command)).toMatchObject({
			execute: owned.execute,
		})
		expect(() => {
			graph.bindings.bindHandlers([contribution])
		}).toThrow('already bound')
	})

	it('rejects a foreign static binding before setup or handler materialization', async () => {
		const owned = fixture()
		const setup = vi.fn()
		const foreign = createPlugin({
			core: '^0.0.0',
			id: 'fixture.command-graph.foreign',
			version: '1.0.0',
			permissions: {
				'transport:expose': 'Exercises exact ownership rejection.',
			},
			contributions: [
				contributeApplication((context) => {
					setup(context)
					return { exports: undefined }
				}),
				contributeOperationBinding(owned.binding),
			],
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
		expect(owned.create).not.toHaveBeenCalled()
		expect(owned.cleanup).not.toHaveBeenCalled()
		expect(() =>
			readApplicationKernelState(application).commands.bindings.transport(
				requireCommand(
					readApplicationKernelState(application).commands,
					owned.operation,
				),
				transport,
			),
		).toThrow('no longer available')
	})
})
