import { stringField } from '../../src/index.js'

export const emailField = /* hover:field-definition */ stringField({
	validation: { nullable: true },
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
		/* hover:field-family-declaration */ beforeSave: {
			all: ({ value }) => {
				void value
			},
			create: ({ kind, value }) => {
				const /* hover:field-create-family-kind */ createKind = kind

				void createKind
				void value
			},
		},
		onChange: ({ change, timing }) => {
			const changeTiming = /* hover:change-timing */ timing
			const /* hover:current-state */ current = change.current

			void changeTiming
			if (current.present) {
				current.value?.trim()
			}
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
		resolveOutput: {/* completion:field-operation-families */},
	},
})
stringField({
	hooks: {
		// @ts-expect-error -- The incomplete map exists only to request completions.
		beforeSave: {/* completion:field-save-families */},
	},
})
stringField({
	hooks: {
		beforeCreate: [
			({ /* completion:field-list-input */ ...input }) => {
				void input
			},
		],
	},
})
stringField({
	hooks: {
		// @ts-expect-error -- Read families are unavailable to save-only phases.
		beforeSave: {
			find: () => undefined,
		},
	},
})
// @ts-expect-error -- Ordered hook declarations must never be empty.
stringField({ hooks: { beforeCreate: [] } })
stringField({
	hooks: {
		onChange: ({ /* completion:on-change */ ...input }) => {
			void input
		},
	},
})
