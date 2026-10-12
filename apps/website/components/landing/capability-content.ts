/** Complete schema examples are compiled and typechecked by the landing content tests. */
export const virtualFieldExample = `import { UltimaBase } from '@ultimabase/core'

export const Profile = UltimaBase.Schema.define({
  className: 'Profile',
  fields: (f) => ({
    firstName: f.string({ required: true }),
    lastName: f.string({ required: true }),
    displayName: f.virtual({
      output: (o) => o.string({ nullable: false }),
      select: { firstName: true, lastName: true },
      resolve: ({ item }) =>
        \`\${item.firstName} \${item.lastName}\`,
    }),
  }),
})`

export const validationRule = 'z.string().min(1).max(200)'

export const validationFieldExample = `import { UltimaBase } from '@ultimabase/core'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { z } from 'zod'

const Application = UltimaBase.use(validationPlugin())

export const ValidatedArticle = Application.Schema.define({
  className: 'ValidatedArticle',
  fields: (f) => ({
    title: f.string({
      required: true,
      validation: ${validationRule},
    }),
  }),
})`

export const dataCapabilities = [
	{
		title: 'Structured values',
		description:
			'Typed embedded objects, lists, enums, and exact decimals. Declare defaults, unique indexes, and immutable fields in your schema.',
		href: 'core/data-modeling/fields',
		label: 'Explore field types',
	},
	{
		title: 'Related records',
		description:
			'Connect records with pointers and relations. Load related models and create or update related data in one atomic nested write.',
		href: 'core/writing-data/nested-writes',
		label: 'Explore nested writes',
	},
	{
		title: 'Application validation',
		code: validationRule,
		description:
			'Add synchronous Standard Schema rules, including Zod, with the Validation plugin. Core always checks data structure; Hooks can normalize input first.',
		href: 'plugins/official/validation',
		label: 'Explore validation',
	},
] as const

export const writeCapabilities = [
	{
		title: 'Atomic increments',
		description:
			'Update counters and exact decimals without a separate read-and-write cycle.',
		href: 'core/writing-data/update',
		label: '{ increment: 1 }',
	},
	{
		title: 'Unique upserts',
		description:
			'Create a missing record or update an existing one through a declared unique key.',
		href: 'core/writing-data/upserts',
		label: 'upsertOne()',
	},
	{
		title: 'Atomic batches',
		description:
			'Create, update, upsert, or delete exact targets in order. One failed item rolls back the batch.',
		href: 'core/writing-data/bulk-operations',
		label: 'createMany()',
	},
] as const

// The policy excerpt is also compiled in its complete schema below.
export const accessRuleExample = `access: {
  read: ({ where }) =>
    where.eq('published', true),
}`

export const accessSchemaExample = `import { UltimaBase } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'

const Application = UltimaBase.use(accessPlugin())
export const PublicArticle = Application.Schema.define({
  className: 'PublicArticle',
  fields: (f) => ({
    title: f.string({ required: true }),
    published: f.boolean({ required: true, default: false }),
  }),
}).with({
  ${accessRuleExample},
})`

export const accessCapabilities = [
	{
		title: 'Operations',
		detail: 'Choose who may read, create, update, or delete.',
	},
	{
		title: 'Rows',
		detail: 'Add private filters to restrict which records a caller can reach.',
	},
	{
		title: 'Fields',
		detail: 'Control output, filtering, sorting, and writes independently.',
	},
	{
		title: 'Object ACLs',
		detail: 'Grant read, update, or delete rights to specific users or roles.',
	},
] as const
