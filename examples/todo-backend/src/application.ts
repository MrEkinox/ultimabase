import { createTodoApplication } from './create-application.ts'

const databaseUrl = process.env.DATABASE_URL

if (databaseUrl === undefined || databaseUrl.trim() === '') {
	throw new TypeError('DATABASE_URL is required to start the Todo backend')
}

/** Owns the Todo schema, automatic type generation, and PostgreSQL lifecycle. */
export const ultimabase = createTodoApplication({ databaseUrl })
