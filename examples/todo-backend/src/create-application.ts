import { fileURLToPath } from 'node:url'

import { accessPlugin } from '@ultimabase/access-plugin'
import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { typegenPlugin } from '@ultimabase/typegen'
import { validationPlugin } from '@ultimabase/validation-plugin'

import { Todo, TodoRole, TodoUser } from './schema.ts'

const defaultGeneratedTypesPath = fileURLToPath(
	new URL('../.ultimabase/schema.generated.d.ts', import.meta.url),
)

/** Configures the infrastructure values that vary between Todo deployments. */
export interface TodoApplicationOptions {
	/** Connection URL; without it, `DATABASE_URL` is read at start (ADR-0312). */
	readonly databaseUrl?: string
	readonly generatedTypesPath?: string
}

/** Retains one canonical schema order for Runtime and standalone Typegen checks. */
export const todoSchemas = [TodoUser, TodoRole, Todo] as const

/** Builds the complete deterministic plugin graph without starting resources. */
export const createTodoPlugins = ({
	databaseUrl,
	generatedTypesPath = defaultGeneratedTypesPath,
}: TodoApplicationOptions = {}) =>
	[
		accessPlugin({ default: true }),
		hooksPlugin(),
		validationPlugin(),
		rolesPlugin(),
		aclPlugin(),
		typegenPlugin({
			applicationId: 'todo-backend',
			outputPath: generatedTypesPath,
		}),
		postgresPlugin(
			databaseUrl === undefined
				? { schemaPolicy: 'override' }
				: { schemaPolicy: 'override', url: databaseUrl },
		),
	] as const

/** Builds one isolated Todo application with every schema-owning official plugin. */
export const createTodoApplication = (options: TodoApplicationOptions = {}) => {
	const Application = UltimaBase.use(...createTodoPlugins(options))
	return new Application({ schemas: todoSchemas })
}

// One declaration per application (ADR-0297 amendment 1). Typegen names these
// old-form schemas; registering the real application would make the Role
// schema reference itself through the registry (TS7022) until Roles moves to
// its schema factory.
declare module '@ultimabase/core' {
	interface Register {
		readonly app: UltimaBase<readonly []>
	}
}
