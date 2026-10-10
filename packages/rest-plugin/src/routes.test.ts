import { onTestFinished, describe, expect, it } from 'vitest'
import {
	UltimaBase,
	plugin,
	contributeDeclarations,
	definePluginField,
	definePluginOutputDescriptor,
} from '@ultimabase/core'
import { initializeRestTestApplication as createApplication } from './application.test-support.js'

import {
	restFieldCodec,
	restPlugin,
	type RestPluginExports,
	type RestSchemaRoutesOption,
} from './index.js'

const RestSchemaApplication = UltimaBase.use(restPlugin())
const defineRestSchema = (className: string, rest?: RestSchemaRoutesOption) =>
	RestSchemaApplication.Schema.define({
		className,
		...(rest === undefined ? {} : { rest }),
		fields: () => ({}),
	})

// Runtime-negative fixtures bypass only the static option check under test.
const defineInvalidRestSchema = (className: string, rest: unknown) =>
	RestSchemaApplication.Schema.define({
		className,
		fields: () => ({}),
		rest,
	} as never)

const readRest = (
	application: Awaited<ReturnType<typeof createApplication>>,
	instanceId?: string,
): RestPluginExports => {
	const exports =
		instanceId === undefined
			? application.plugin('@ultimabase/rest-plugin')
			: application.plugin({
					instanceId,
					pluginId: '@ultimabase/rest-plugin',
				})
	return exports as RestPluginExports
}

const summarize = (exports: RestPluginExports) =>
	exports.routeGraph.routes.map((route) => ({
		method: route.method,
		operation: route.operation,
		path: route.path,
		schema: route.kind === 'rest-schema-route' ? route.schema : undefined,
	}))

const hasErrorCauseMessage = (error: unknown, message: string): boolean => {
	let candidate = error
	while (candidate instanceof Error) {
		if (candidate.message.includes(message)) return true
		candidate = candidate.cause
	}
	return false
}

describe('REST route metadata', () => {
	it('generates the accepted provenance-aware defaults in deterministic order', async () => {
		const Post = defineRestSchema('Post')
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [restPlugin()],
			schemas: [Post],
		})
		onTestFinished(() => application.dispose())
		const rest = readRest(application)

		expect(summarize(rest)).toMatchInlineSnapshot(`
			[
			  {
			    "method": "GET",
			    "operation": "find",
			    "path": "/api/v1/classes/Post",
			    "schema": "Post",
			  },
			  {
			    "method": "POST",
			    "operation": "create",
			    "path": "/api/v1/classes/Post",
			    "schema": "Post",
			  },
			  {
			    "method": "POST",
			    "operation": "find",
			    "path": "/api/v1/classes/Post/query",
			    "schema": "Post",
			  },
			  {
			    "method": "GET",
			    "operation": "first",
			    "path": "/api/v1/classes/Post/first",
			    "schema": "Post",
			  },
			  {
			    "method": "POST",
			    "operation": "first",
			    "path": "/api/v1/classes/Post/first",
			    "schema": "Post",
			  },
			  {
			    "method": "GET",
			    "operation": "exists",
			    "path": "/api/v1/classes/Post/exists",
			    "schema": "Post",
			  },
			  {
			    "method": "POST",
			    "operation": "exists",
			    "path": "/api/v1/classes/Post/exists",
			    "schema": "Post",
			  },
			  {
			    "method": "GET",
			    "operation": "get",
			    "path": "/api/v1/classes/Post/{id}",
			    "schema": "Post",
			  },
			  {
			    "method": "PATCH",
			    "operation": "update",
			    "path": "/api/v1/classes/Post/{id}",
			    "schema": "Post",
			  },
			  {
			    "method": "DELETE",
			    "operation": "delete",
			    "path": "/api/v1/classes/Post/{id}",
			    "schema": "Post",
			  },
			]
		`)
		expect(rest.basePath).toBe('/api/v1')
		expect(rest.routeGraph.protocol).toMatchObject({
			kind: 'operation-transport-protocol',
			name: 'ultimabase.rest',
			version: '1.0.0',
		})
		expect(Object.isFrozen(rest.routeGraph.routes)).toBe(true)
		for (const route of rest.routeGraph.routes) {
			expect(route.provenance).toMatchObject({
				method: route.method,
				operation: route.operation,
				path: route.path,
				plugin: {
					pluginId: '@ultimabase/rest-plugin',
					version: '0.0.0',
				},
				protocolVersion: '1.0.0',
				schema: {
					contributionId: 'schema:Post',
					owner: { kind: 'application' },
				},
			})
			expect(route.provenance.application).toBe(
				rest.routeGraph.routes[0]?.provenance.application,
			)
		}

		await application.dispose()
	})

	it('resolves schema operations over sparse plugin defaults and built-ins', async () => {
		const Post = defineRestSchema('Configured Post', {
			bulk: { create: false, update: true },
			count: true,
			find: false,
		})
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [
				restPlugin({
					basePath: '/public',
					default: { bulk: true, get: false, upsert: true },
				}),
			],
			schemas: [Post],
		})
		onTestFinished(() => application.dispose())
		const routes = summarize(readRest(application))

		expect(routes.map(({ operation }) => operation)).toStrictEqual([
			'create',
			'first',
			'first',
			'count',
			'count',
			'exists',
			'exists',
			'upsert',
			'bulkUpdate',
			'bulkDelete',
			'bulkUpsert',
			'update',
			'delete',
		])
		expect(routes.every(({ path }) => path.startsWith('/public/v1/'))).toBe(
			true,
		)
		expect(routes[0]?.path).toContain('Configured%20Post')

		await application.dispose()
	})

	it('supports explicit all-on and all-off selections', async () => {
		const Enabled = defineRestSchema('Enabled', true)
		const Disabled = defineRestSchema('Disabled', false)
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [restPlugin({ default: false })],
			schemas: [Enabled, Disabled],
		})
		onTestFinished(() => application.dispose())
		const routes = readRest(application).routeGraph.routes.filter(
			(route) => route.kind === 'rest-schema-route',
		)

		expect(routes).toHaveLength(17)
		expect(new Set(routes.map(({ schema }) => schema))).toStrictEqual(
			new Set(['Enabled']),
		)

		await application.dispose()
	})

	it('snapshots plugin and schema configuration without retaining mutable input', async () => {
		const defaults: { count: boolean } = { count: true }
		const schemaRoutes: { find: boolean } = { find: false }
		const plugin = restPlugin({ default: defaults })
		const Post = defineRestSchema('ImmutableRoutes', schemaRoutes)

		defaults.count = false
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [Post],
		})
		onTestFinished(() => application.dispose())
		const routes = readRest(application).routeGraph.routes

		expect(routes.some(({ operation }) => operation === 'count')).toBe(true)
		expect(routes.some(({ operation }) => operation === 'find')).toBe(false)
		expect(Object.isFrozen(Reflect.get(Post.definition, 'rest'))).toBe(true)
		await application.dispose()
	})

	it.each([
		[{ bulk: { arbitrary: true } }, 'rest.bulk contains unknown option'],
		[{ count: 'yes' }, 'rest.count must be a boolean'],
		[{ query: true }, 'rest contains unknown option'],
	])('rejects malformed direct schema routes %#', async (rest, message) => {
		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [restPlugin()],
				schemas: [defineInvalidRestSchema('MalformedRestRoutes', rest)],
			}),
		).rejects.toSatisfy((error: unknown) =>
			hasErrorCauseMessage(error, message),
		)
	})

	it('keeps plugin-owned storage private and rejects misleading route options', async () => {
		const Internal = defineRestSchema('CredentialStore')
		const storagePlugin = (withRest: boolean) =>
			plugin({
				core: '^0.0.0',
				id: 'fixture.credentials',
				version: '1.0.0',
				permissions: {
					'schema:declare': 'Declares fixture credential storage.',
				},
				contributions: [
					contributeDeclarations({
						schema: ({ schemas }) => {
							schemas.add({
								contributionId: 'credential-storage',
								schema: withRest
									? defineRestSchema('CredentialStoreWithRest', true)
									: Internal,
							})

							return undefined
						},
					}),
				],
			})
		const privateApplication = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [storagePlugin(false), restPlugin({ default: true })],
			schemas: [],
		})
		onTestFinished(() => privateApplication.dispose())

		expect(readRest(privateApplication).routeGraph.routes).toStrictEqual([])
		await privateApplication.dispose()

		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [storagePlugin(true), restPlugin()],
				schemas: [],
			}),
		).rejects.toThrow(
			'Plugin-owned schema "CredentialStoreWithRest" cannot declare REST schema routes',
		)
	})

	it('rebuilds from each complete graph without stale dynamic schemas', async () => {
		const pluginWithSchema = (enabled: boolean) =>
			plugin({
				core: '^0.0.0',
				id: 'fixture.dynamic-schema',
				version: '1.0.0',
				permissions: {
					'schema:declare': 'Conditionally declares one storage schema.',
				},
				contributions: [
					contributeDeclarations({
						schema: ({ schemas }) => {
							if (enabled) {
								schemas.add({
									contributionId: 'dynamic',
									schema: defineRestSchema('DynamicStorage'),
								})
							}

							return undefined
						},
					}),
				],
			})
		const Visible = defineRestSchema('Visible')
		const compile = (withDynamicSchema: boolean) =>
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [pluginWithSchema(withDynamicSchema), restPlugin()],
				schemas: [Visible],
			})
		const first = await compile(true)
		const firstRoutes = summarize(readRest(first))
		await first.dispose()
		const second = await compile(false)

		expect(firstRoutes).toStrictEqual(summarize(readRest(second)))
		expect(first.compile().schemas.has('DynamicStorage')).toBe(true)
		expect(second.compile().schemas.has('DynamicStorage')).toBe(false)
		await first.dispose()
		await second.dispose()
	})

	it('composes explicit instances and reports deterministic route conflicts', async () => {
		const Post = defineRestSchema('Post')
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [
				restPlugin({ basePath: '/public', instanceId: 'public' }),
				restPlugin({ basePath: '/admin', instanceId: 'admin' }),
			],
			schemas: [Post],
		})
		onTestFinished(() => application.dispose())
		const publicRest = readRest(application, 'public')
		const adminRest = readRest(application, 'admin')

		expect(publicRest.routeGraph).toBe(adminRest.routeGraph)
		expect(publicRest.routeGraph.routes).toHaveLength(20)
		expect(
			new Set(
				publicRest.routeGraph.routes.map(
					({ provenance }) => provenance.plugin.instanceId,
				),
			),
		).toStrictEqual(new Set(['public', 'admin']))
		await application.dispose()

		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [
					restPlugin({ instanceId: 'first' }),
					restPlugin({ instanceId: 'second' }),
				],
				schemas: [Post],
			}),
		).rejects.toThrow(
			'REST route collision for GET "/api/v1/classes/Post" between @ultimabase/rest-plugin#first and @ultimabase/rest-plugin#second',
		)
	})

	it('keeps application provenance isolated while route snapshots repeat', async () => {
		const Post = defineRestSchema('Post')
		const create = () =>
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [restPlugin()],
				schemas: [Post],
			})
		const first = await create()
		const firstRest = readRest(first)
		await first.dispose()
		const second = await create()
		const secondRest = readRest(second)

		expect(summarize(firstRest)).toStrictEqual(summarize(secondRest))
		expect(firstRest.routeGraph.routes[0]?.provenance.application).not.toBe(
			secondRest.routeGraph.routes[0]?.provenance.application,
		)
		await first.dispose()
		await second.dispose()
	})

	it('requires an owner-attached REST codec for every exposed plugin field', async () => {
		const field = (withCodec: boolean) =>
			definePluginField(
				'fixture.route-code',
				{},
				{
					snapshotValue: (value): string => {
						if (typeof value !== 'string')
							throw new TypeError('code must be a string')
						return value
					},
					...(withCodec
						? {
								wireCodecs: [
									restFieldCodec({
										decode: (value) => String(value),
										encode: (value) => value,
									}),
								],
							}
						: {}),
				},
			)
		const define = (withCodec: boolean) =>
			UltimaBase.Schema.define({
				className: 'PluginFieldRoute',
				fields: (builder) => ({
					embedded: builder.object({
						fields: () => ({ code: field(withCodec) }),
					}),
				}),
			})

		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [restPlugin()],
				schemas: [define(false)],
			}),
		).rejects.toThrow('requires an exact REST v1 field codec')

		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [restPlugin()],
			schemas: [define(true)],
		})
		onTestFinished(() => application.dispose())
		expect(readRest(application).routeGraph.routes.length).toBeGreaterThan(0)
		await application.dispose()
	})

	it('advertises exact virtual outputs without private resolver dependencies', async () => {
		const Virtual = UltimaBase.Schema.define({
			className: 'VirtualRoute',
			fields: (field) => ({
				name: field.string(),
				summary: field.virtual({
					output: (output) =>
						output.object({
							fields: (nested) => ({ label: nested.string() }),
							typeName: 'VirtualRouteSummary',
						}),
					resolve: ({ item }) => ({ label: String(item.name) }),
					select: { name: true },
				}),
			}),
		})
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [restPlugin()],
			schemas: [Virtual],
		})
		onTestFinished(() => application.dispose())
		const route = readRest(application).routeGraph.routes.find(
			(candidate) => candidate.kind === 'rest-schema-route',
		)
		if (route?.kind !== 'rest-schema-route') {
			throw new TypeError('Virtual REST schema route is unavailable')
		}

		expect(route.virtualFields).toStrictEqual({
			summary: Virtual.virtualFields.summary?.output,
		})
		expect(route.virtualFields.summary).toBe(
			Virtual.virtualFields.summary?.output,
		)
		expect(Object.isFrozen(route.virtualFields)).toBe(true)
		expect(route.virtualFields.summary).not.toHaveProperty('resolve')
		expect(route.virtualFields.summary).not.toHaveProperty('select')
		await application.dispose()
	})

	it('rejects a plugin virtual output without an exact REST representation', async () => {
		const pluginOutput = definePluginOutputDescriptor(
			'fixture.virtual-output',
			{ list: false, nullable: false },
			(value, path): string => {
				if (typeof value !== 'string')
					throw new TypeError(`${path} must be text`)
				return value
			},
		)
		const Virtual = UltimaBase.Schema.define({
			className: 'UnsupportedVirtualRoute',
			fields: (field) => ({
				value: field.string(),
				derived: field.virtual({
					output: () => pluginOutput,
					resolve: ({ item }) => String(item.value),
					select: { value: true },
				}),
			}),
		})

		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [restPlugin()],
				schemas: [Virtual],
			}),
		).rejects.toThrow('without an exact REST v1 representation')
	})

	it.each([
		[
			{ default: { unknown: true } },
			'REST plugin default contains unknown option',
		],
		[{ basePath: 'api' }, 'REST plugin basePath must be an absolute path'],
		[{ basePath: '/api/v1' }, 'cannot contain dot or protocol-version'],
		[{ bodyLimit: 0 }, 'bodyLimit must be a positive safe integer'],
		[
			{ pagination: { maxTake: 1.5 } },
			'pagination.maxTake must be a positive safe integer',
		],
		[
			{ pagination: { defaultTake: 0 } },
			'pagination.defaultTake must be a positive safe integer',
		],
		[
			{ pagination: { defaultTake: 11, maxTake: 10 } },
			'pagination.defaultTake must not exceed pagination.maxTake',
		],
		[{ pagination: { size: 1 } }, 'pagination has an unknown option: size'],
		[{ maxLimit: 10 }, 'Unknown REST plugin options key: maxLimit'],
		[
			{ acknowledgeUnverifiedProtection: false },
			'acknowledgeUnverifiedProtection must be true',
		],
	])('rejects malformed plugin options %#', (options, message) => {
		expect(() => restPlugin(options as never)).toThrow(message)
	})
})
