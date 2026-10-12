import { toJSON, type MasterAccessEvent } from '@ultimabase/core'
import * as corePlugin from '@ultimabase/core/plugin'
import type { PostgresPool } from '@ultimabase/postgres-plugin'
import type { HonoServerPlugin } from '@ultimabase/hono-server-plugin'
import { vi } from 'vitest'

export interface MinimalApplication {
	dispose(): Promise<void>
	start(): Promise<void>
}

export interface MinimalClient {
	fetch(path: string, init?: RequestInit): Promise<Response>
}

export interface MinimalExampleModule {
	readonly ExampleArticle: object
	readonly ExampleAuthor: object
	readonly ExamplePrivateNote: object
	readonly ExampleRole: object
	readonly ExampleSoftDeleteEvent: object
	readonly ExampleUser: object
	readonly purgeArticle: (id: string) => Promise<unknown>
	readonly restoreArticle: (id: string) => Promise<unknown>
	readonly softDeleteArticle: (
		application: MinimalApplication,
		id: string,
		sessionToken: string,
	) => Promise<unknown>
	readonly softDeleteAuthor: (id: string) => Promise<unknown>
	readonly createMinimalApplication: (options: {
		readonly applicationId: string
		readonly browserOrigin?: string
		readonly databasePool?: PostgresPool
		readonly databaseUrl?: string
		readonly masterKey: string
		readonly masterTransport?: boolean
		readonly onMasterUse: (event: MasterAccessEvent) => void
		readonly server: HonoServerPlugin
	}) => MinimalApplication
	readonly createMinimalClient: (options: {
		readonly applicationId: string
		readonly baseUrl: string
		readonly masterKey?: string
		readonly sessionToken?: string
	}) => MinimalClient
}

const isObjectLike = (value: unknown): value is object =>
	(typeof value === 'object' && value !== null) || typeof value === 'function'

/** Loads the example through Vitest without adding its Typegen registry globally. */
export const loadMinimalExample = async (): Promise<MinimalExampleModule> => {
	// Import sequentially, schemas first: parallel importActual calls can make
	// Vitest's module runner evaluate schema.ts twice in one worker, leaving the
	// test with schema classes the application never compiled.
	const schemaModule = await vi.importActual<unknown>(
		'../../examples/minimal/src/schema.ts',
	)
	const applicationModule = await vi.importActual<unknown>(
		'../../examples/minimal/src/create-application.ts',
	)
	const clientModule = await vi.importActual<unknown>(
		'../../examples/minimal/src/client.ts',
	)
	const softDeleteModule = await vi.importActual<unknown>(
		'../../examples/minimal/src/soft-delete.ts',
	)
	if (
		typeof applicationModule !== 'object' ||
		applicationModule === null ||
		!('createMinimalApplication' in applicationModule) ||
		typeof applicationModule.createMinimalApplication !== 'function' ||
		typeof schemaModule !== 'object' ||
		schemaModule === null ||
		!('ExampleArticle' in schemaModule) ||
		!isObjectLike(schemaModule.ExampleArticle) ||
		!('ExampleAuthor' in schemaModule) ||
		!isObjectLike(schemaModule.ExampleAuthor) ||
		!('ExamplePrivateNote' in schemaModule) ||
		!isObjectLike(schemaModule.ExamplePrivateNote) ||
		!('ExampleRole' in schemaModule) ||
		!isObjectLike(schemaModule.ExampleRole) ||
		!('ExampleSoftDeleteEvent' in schemaModule) ||
		!isObjectLike(schemaModule.ExampleSoftDeleteEvent) ||
		!('ExampleUser' in schemaModule) ||
		!isObjectLike(schemaModule.ExampleUser) ||
		typeof clientModule !== 'object' ||
		clientModule === null ||
		!('createMinimalClient' in clientModule) ||
		typeof clientModule.createMinimalClient !== 'function' ||
		typeof softDeleteModule !== 'object' ||
		softDeleteModule === null ||
		!('purgeArticle' in softDeleteModule) ||
		typeof softDeleteModule.purgeArticle !== 'function' ||
		!('restoreArticle' in softDeleteModule) ||
		typeof softDeleteModule.restoreArticle !== 'function' ||
		!('softDeleteArticle' in softDeleteModule) ||
		typeof softDeleteModule.softDeleteArticle !== 'function' ||
		!('softDeleteAuthor' in softDeleteModule) ||
		typeof softDeleteModule.softDeleteAuthor !== 'function'
	) {
		throw new TypeError('Minimal example exports are invalid')
	}
	return {
		ExampleArticle: schemaModule.ExampleArticle,
		ExampleAuthor: schemaModule.ExampleAuthor,
		ExamplePrivateNote: schemaModule.ExamplePrivateNote,
		ExampleRole: schemaModule.ExampleRole,
		ExampleSoftDeleteEvent: schemaModule.ExampleSoftDeleteEvent,
		ExampleUser: schemaModule.ExampleUser,
		createMinimalApplication: applicationModule.createMinimalApplication,
		createMinimalClient: clientModule.createMinimalClient,
		purgeArticle: softDeleteModule.purgeArticle,
		restoreArticle: softDeleteModule.restoreArticle,
		softDeleteArticle: softDeleteModule.softDeleteArticle,
		softDeleteAuthor: softDeleteModule.softDeleteAuthor,
	} as MinimalExampleModule
}

/**
 * Calls a plugin-author function of `@ultimabase/core/plugin` (ADR-0311) with
 * the untyped example application.
 */
export const invokeCorePlugin = (
	name: 'anonymous' | 'authorizeMasterKey',
	arguments_: readonly unknown[],
): Promise<unknown> =>
	Promise.resolve(Reflect.apply(corePlugin[name], undefined, arguments_))

/** Calls a checked public method across the untyped JavaScript example boundary. */
export const invoke = (
	target: object,
	methodName: string,
	arguments_: readonly unknown[],
): Promise<unknown> => {
	const method: unknown = Reflect.get(target, methodName)
	if (typeof method !== 'function') {
		throw new TypeError(`Expected ${methodName} to be callable`)
	}
	return Promise.resolve(Reflect.apply(method, target, arguments_))
}

export const readObject = (value: unknown, label: string): object => {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError(`${label} must be an object`)
	}
	return value
}

export const readString = (value: object, key: string): string => {
	const entry: unknown = Reflect.get(value, key)
	if (typeof entry !== 'string') {
		throw new TypeError(`${key} must be a string`)
	}
	return entry
}

/** Serializes a direct result as REST does (ADR-0310). */
export const modelJson = (value: unknown): Promise<unknown> =>
	Promise.resolve(toJSON(readObject(value, 'result')))

/** Executes the example's GraphQL application without crossing an HTTP boundary. */
export const executeMinimalGraphql = async (
	application: MinimalApplication,
	document: string,
	requestId: string,
	variables?: Readonly<Record<string, unknown>>,
): Promise<unknown> => {
	const anonymous = await invokeCorePlugin('anonymous', [
		application,
		{ requestId, source: 'internal' },
	])
	const context: unknown = Reflect.get(
		readObject(anonymous, 'anonymous context'),
		'context',
	)
	const graphql = await invoke(application, 'plugin', [
		'@ultimabase/graphql-plugin',
	])
	return invoke(readObject(graphql, 'GraphQL application'), 'execute', [
		{
			context,
			document,
			...(variables === undefined ? {} : { variables }),
		},
	])
}
