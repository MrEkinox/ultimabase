import type { MasterAccessEvent } from '@ultimabase/core'
import type { HonoServerPlugin } from '@ultimabase/server-hono-plugin'
import { vi } from 'vitest'

export interface MinimalApplication {
	dispose(): Promise<void>
	start(): Promise<void>
}

export interface MinimalRestClient {
	fetch(path: string, init?: RequestInit): Promise<Response>
}

export interface MinimalExampleModule {
	readonly ExampleArticle: object
	readonly ExampleAuthor: object
	readonly createMinimalRestApplication: (options: {
		readonly applicationId: string
		readonly databaseUrl: string
		readonly masterKey: string
		readonly masterTransport?: boolean
		readonly onMasterUse: (event: MasterAccessEvent) => void
		readonly server: HonoServerPlugin
	}) => MinimalApplication
	readonly createMinimalRestClient: (options: {
		readonly applicationId: string
		readonly baseUrl: string
		readonly masterKey?: string
	}) => MinimalRestClient
}

const isObjectLike = (value: unknown): value is object =>
	(typeof value === 'object' && value !== null) || typeof value === 'function'

/** Loads the example through Vitest without adding its Typegen registry globally. */
export const loadMinimalExample = async (): Promise<MinimalExampleModule> => {
	const modulePaths = [
		'../../examples/minimal/src/create-application.ts',
		'../../examples/minimal/src/schema.ts',
		'../../examples/minimal/src/client.ts',
	]
	const [applicationModule, schemaModule, clientModule]: unknown[] =
		await Promise.all(
			modulePaths.map(async (path) => vi.importActual<unknown>(path)),
		)
	if (
		typeof applicationModule !== 'object' ||
		applicationModule === null ||
		!('createMinimalRestApplication' in applicationModule) ||
		typeof applicationModule.createMinimalRestApplication !== 'function' ||
		typeof schemaModule !== 'object' ||
		schemaModule === null ||
		!('ExampleArticle' in schemaModule) ||
		!isObjectLike(schemaModule.ExampleArticle) ||
		!('ExampleAuthor' in schemaModule) ||
		!isObjectLike(schemaModule.ExampleAuthor) ||
		typeof clientModule !== 'object' ||
		clientModule === null ||
		!('createMinimalRestClient' in clientModule) ||
		typeof clientModule.createMinimalRestClient !== 'function'
	) {
		throw new TypeError('Minimal REST example exports are invalid')
	}
	return {
		ExampleArticle: schemaModule.ExampleArticle,
		ExampleAuthor: schemaModule.ExampleAuthor,
		createMinimalRestApplication:
			applicationModule.createMinimalRestApplication,
		createMinimalRestClient: clientModule.createMinimalRestClient,
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
