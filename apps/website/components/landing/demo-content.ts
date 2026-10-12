import { readExample, schemaExample, writeExample } from './content'

/** The content test checks these field types against the compiler's inferred models. */
const modelFields = [
	{ name: 'id', type: 'string' },
	{ name: 'title', type: 'string' },
	{ name: 'published', type: 'boolean' },
] as const

export const demoExamples = [
	{
		label: 'Schema',
		file: 'article.ts',
		code: schemaExample,
		title: 'Declare fields once.',
		description: 'Your schema defines the field types on an Article model.',
		fields: modelFields,
		note: 'Core provides id. published is required and defaults to false.',
	},
	{
		label: 'Read',
		file: 'read.ts',
		code: readExample,
		title: 'Select fields. Narrow the type.',
		description: 'Each returned model exposes the selected fields, plus id.',
		fields: modelFields.filter((field) => field.name !== 'published'),
		note: 'Filter by published without returning it. Only title and id appear in the result.',
	},
	{
		label: 'Write',
		file: 'write.ts',
		code: writeExample,
		title: 'Create data. Get a typed model.',
		description: 'The created Article carries your declared field types.',
		fields: modelFields,
		note: 'A number cannot be assigned to title. TypeScript expects a string.',
	},
] as const
