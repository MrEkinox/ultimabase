import { fileURLToPath } from 'node:url'

import { accessPlugin } from '@ultimabase/access-plugin'
import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { typegenPlugin } from '@ultimabase/typegen'

import { Todo, TodoRole, TodoUser } from './schema.ts'

const defaultGeneratedTypesPath = fileURLToPath(
	new URL('../.ultimabase/schema.generated.d.ts', import.meta.url),
)

/** Configures the infrastructure values that vary between Todo deployments. */
export interface TodoApplicationOptions {
	readonly databaseUrl: string
	readonly generatedTypesPath?: string
}

/** Retains one canonical schema order for Runtime and standalone Typegen checks. */
export const todoSchemas = [TodoUser, TodoRole, Todo] as const

/** Builds the complete deterministic plugin graph without starting resources. */
export const createTodoPlugins = ({
	databaseUrl,
	generatedTypesPath = defaultGeneratedTypesPath,
}: TodoApplicationOptions) =>
	[
		accessPlugin(),
		hooksPlugin(),
		rolesPlugin(),
		aclPlugin(),
		typegenPlugin({
			applicationId: 'todo-backend',
			outputPath: generatedTypesPath,
		}),
		postgresPlugin({
			schemaPolicy: 'override',
			url: databaseUrl,
		}),
	] as const

/** Builds one isolated Todo application with every schema-owning official plugin. */
export const createTodoApplication = (options: TodoApplicationOptions) =>
	new UltimaBase({
		plugins: createTodoPlugins(options),
		schemas: todoSchemas,
	})
