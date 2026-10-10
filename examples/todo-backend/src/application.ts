import { createTodoApplication } from './create-application.ts'

/**
 * Owns the Todo schema, automatic type generation, and PostgreSQL lifecycle.
 * `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const ultimabase = createTodoApplication()
