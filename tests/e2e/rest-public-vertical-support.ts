import type { MasterAccessEvent } from '@ultimabase/core'
import type { HonoServerPlugin } from '@ultimabase/server-hono-plugin'
import { vi } from 'vitest'

export interface MinimalApplication {
	readonly application: object
	readonly engine: object
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
	readonly purgeArticle: (
		application: MinimalApplication,
		id: string,
	) => Promise<unknown>
	readonly restoreArticle: (
		application: MinimalApplication,
		id: string,
	) => Promise<unknown>
	readonly softDeleteArticle: (
		application: MinimalApplication,
		id: string,
		sessionToken: string,
	) => Promise<unknown>
	readonly softDeleteArticleFromModel: (
		application: MinimalApplication,
		id: string,
		sessionToken: string,
	) => Promise<unknown>
	readonly softDeleteAuthor: (
		application: MinimalApplication,
		id: string,
	) => Promise<unknown>
	readonly createMinimalApplication: (options: {
		readonly applicationId: string
		readonly browserOrigin?: string
		readonly databaseUrl: string
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
	const modulePaths = [
		'../../examples/minimal/src/create-application.ts',
		'../../examples/minimal/src/schema.ts',
		'../../examples/minimal/src/client.ts',
		'../../examples/minimal/src/soft-delete.ts',
	]
	const [
		applicationModule,
		schemaModule,
		clientModule,
		softDeleteModule,
	]: unknown[] = await Promise.all(
		modulePaths.map(async (path) => vi.importActual<unknown>(path)),
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
		!('softDeleteArticleFromModel' in softDeleteModule) ||
		typeof softDeleteModule.softDeleteArticleFromModel !== 'function' ||
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
		softDeleteArticleFromModel: softDeleteModule.softDeleteArticleFromModel,
		softDeleteAuthor: softDeleteModule.softDeleteAuthor,
	} as MinimalExampleModule
}

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

export const modelJson = async (value: unknown): Promise<unknown> =>
	invoke(readObject(value, 'model'), 'toJSON', [])

/** Executes the example's GraphQL application without crossing an HTTP boundary. */
export const executeMinimalGraphql = async (
	application: MinimalApplication,
	document: string,
	requestId: string,
	variables?: Readonly<Record<string, unknown>>,
): Promise<unknown> => {
	const anonymous = await invoke(application.engine, 'anonymous', [
		{ requestId, source: 'internal' },
	])
	const context: unknown = Reflect.get(
		readObject(anonymous, 'anonymous context'),
		'context',
	)
	const graphql = await invoke(application.application, 'getPlugin', [
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
