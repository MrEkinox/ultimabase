import { stringField } from '../../src/index.js'

export const emailField = /* hover:field-definition */ stringField({
	hooks: {
		resolveInput: [
			({ value }) => {
				const inputValue = /* hover:input-value */ value

				void 'HOOK_BODY_MUST_NOT_LEAK'
				return inputValue
			},
			({ value }) => {
				const /* hover:field-list-value */ listedValue = value

				return listedValue
			},
		],
	},
})

stringField({
	hooks: {
		/* hover:field-family-declaration */ resolveInput: {
			all: ({ value }) => value,
			create: ({ kind, value }) => {
				const /* hover:field-create-family-kind */ createKind = kind

				void createKind
				return value
			},
		},
	},
})

stringField({ hooks: {/* completion:field-hooks */} })
stringField({
	hooks: {
		resolveInput: ({ /* completion:resolve-input */ ...input }) => {
			void input
			return undefined
		},
	},
})

stringField({
	hooks: {
		// @ts-expect-error -- The incomplete map exists only to request completions.
		resolveInput: {/* completion:field-save-families */},
	},
})
stringField({
	hooks: {
		resolveInput: {
			update: [
				({ /* completion:field-list-input */ ...input }) => {
					void input
					return undefined
				},
			],
		},
	},
})
stringField({
	hooks: {
		resolveInput: {
			// @ts-expect-error -- Read families are unavailable to input phases.
			read: () => undefined,
		},
	},
})
// @ts-expect-error -- Ordered hook declarations must never be empty.
stringField({ hooks: { resolveInput: { create: [] } } })
