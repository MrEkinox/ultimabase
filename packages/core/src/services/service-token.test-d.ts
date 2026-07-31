import { expectTypeOf, test } from 'vitest'

import { createServiceToken, type ServiceToken } from '../index.js'

interface DatabaseService {
	readonly dialect: 'postgres'
	query(sql: string): Promise<readonly unknown[]>
}

interface MailService {
	send(recipient: string): Promise<void>
}

const provideService = <TService>(
	token: ServiceToken<TService>,
	service: NoInfer<TService>,
): readonly [ServiceToken<TService>, TService] => [token, service]

test('preserves exact service types through tokens', () => {
	const databaseToken = createServiceToken<DatabaseService>(
		'ultimabase.database',
	)
	const database: DatabaseService = {
		dialect: 'postgres',
		query: (): Promise<readonly unknown[]> => Promise.resolve([]),
	}

	expectTypeOf(databaseToken).toEqualTypeOf<ServiceToken<DatabaseService>>()
	expectTypeOf(
		provideService(databaseToken, database)[1],
	).toEqualTypeOf<DatabaseService>()
})

test('rejects services from a different token contract', () => {
	const databaseToken = createServiceToken<DatabaseService>(
		'ultimabase.database',
	)
	const mail: MailService = {
		send: (): Promise<void> => Promise.resolve(),
	}

	// @ts-expect-error -- A database token cannot receive a mail implementation.
	provideService(databaseToken, mail)
	// @ts-expect-error -- Private symbols prevent structural token construction.
	const forgedToken: ServiceToken<DatabaseService> = {
		debugName: 'ultimabase.database',
	}

	expectTypeOf(forgedToken).toEqualTypeOf<ServiceToken<DatabaseService>>()
})
