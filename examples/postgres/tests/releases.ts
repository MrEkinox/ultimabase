import { UltimaBase, type Logger } from '@ultimabase/core'
import {
	postgresPlugin,
	type PostgresSchemaPolicy,
} from '@ultimabase/postgres-plugin'

/** The options of one test release: its database and schema policy. */
export interface ReleaseOptions {
	readonly url: string
	readonly schemaPolicy: PostgresSchemaPolicy
	readonly logger: Logger
}

/** Release 1 of the newsroom: an article still had a `headline`. */
export const releaseOne = ({ url, schemaPolicy, logger }: ReleaseOptions) => {
	const Release = UltimaBase.use(postgresPlugin({ url, schemaPolicy }))
	const StaffMember = Release.Schema.define({
		className: 'StaffMember',
		fields: (field) => ({
			name: field.string({ required: true }),
			email: field.string({ required: true, indexed: 'unique' }),
		}),
	})
	const Article = Release.Schema.define({
		className: 'Article',
		fields: (field) => ({
			slug: field.string({ required: true, indexed: 'unique' }),
			headline: field.string({ required: true }),
			author: field.pointer({
				target: () => StaffMember,
				required: true,
				onDelete: 'cascade',
			}),
		}),
	}).with({ postgres: { table: 'newsroom_articles' } })

	const ultimabase = new Release({ schemas: [StaffMember, Article], logger })
	return { ultimabase, Article, StaffMember }
}

/** Release 1 with `headline` renamed to `title` but no `renamedFrom`. */
export const forgottenRename = ({
	url,
	schemaPolicy,
	logger,
}: ReleaseOptions) => {
	const Release = UltimaBase.use(postgresPlugin({ url, schemaPolicy }))
	const StaffMember = Release.Schema.define({
		className: 'StaffMember',
		fields: (field) => ({
			name: field.string({ required: true }),
			email: field.string({ required: true, indexed: 'unique' }),
		}),
	})
	const Article = Release.Schema.define({
		className: 'Article',
		fields: (field) => ({
			slug: field.string({ required: true, indexed: 'unique' }),
			title: field.string({ required: true }),
			author: field.pointer({
				target: () => StaffMember,
				required: true,
				onDelete: 'cascade',
			}),
		}),
	}).with({ postgres: { table: 'newsroom_articles' } })

	return new Release({ schemas: [StaffMember, Article], logger })
}
