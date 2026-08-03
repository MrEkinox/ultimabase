import { expectTypeOf, test } from 'vitest'

import {
	ServiceRegistry,
	createServiceToken,
	type RequiredPluginService,
} from '../index.js'

interface DatabaseService {
	query(sql: string): Promise<readonly unknown[]>
}

interface MailService {
	send(recipient: string): Promise<void>
}

const DatabaseServiceToken = createServiceToken<DatabaseService>(
	'ultimabase.database',
)
const MailServiceToken = createServiceToken<MailService>('ultimabase.mail')

test('infers provided, required, and optional service values', () => {
	const registry = new ServiceRegistry()
	const database: DatabaseService = {
		query: (): Promise<readonly unknown[]> => Promise.resolve([]),
	}

	registry.provide(DatabaseServiceToken, database)
	const pluginServices = registry.forPlugin('fixture.database')
	const requiredDatabase = pluginServices.require(DatabaseServiceToken)

	expectTypeOf(registry.size).toEqualTypeOf<number>()
	expectTypeOf(registry.has(DatabaseServiceToken)).toEqualTypeOf<boolean>()
	expectTypeOf(
		registry.get(DatabaseServiceToken),
	).toEqualTypeOf<DatabaseService>()
	expectTypeOf(registry.getOptional(DatabaseServiceToken)).toEqualTypeOf<
		DatabaseService | undefined
	>()
	expectTypeOf(registry.ownerOf(DatabaseServiceToken)).toEqualTypeOf<
		string | undefined
	>()
	expectTypeOf(
		pluginServices.get(DatabaseServiceToken),
	).toEqualTypeOf<DatabaseService>()
	expectTypeOf(requiredDatabase.get()).toEqualTypeOf<DatabaseService>()
	expectTypeOf(requiredDatabase.debugName).toEqualTypeOf<string>()
	expectTypeOf(registry.dispose()).toEqualTypeOf<Promise<void>>()
})

test('rejects services that do not satisfy their token', () => {
	const registry = new ServiceRegistry()
	const mail: MailService = {
		send: (): Promise<void> => Promise.resolve(),
	}

	// @ts-expect-error -- Database providers must satisfy DatabaseService.
	registry.provide(DatabaseServiceToken, mail)
	// @ts-expect-error -- Mail providers must satisfy MailService.
	registry.provide(MailServiceToken, { query: () => Promise.resolve([]) })
	const requiredDatabase = registry
		.forPlugin('fixture.consumer')
		.require(DatabaseServiceToken)
	// @ts-expect-error -- Required references preserve the selected service type.
	const invalidRequirement: number = requiredDatabase.get()
	void invalidRequirement
	// @ts-expect-error -- Only an owner-bound service registry creates requirements.
	const forgedRequirement: RequiredPluginService<DatabaseService> = {
		debugName: 'forged',
		get: () => ({ query: () => Promise.resolve([]) }),
	}
	void forgedRequirement
})
