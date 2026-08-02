import { stringField } from '../../src/index.js'

export const emailField = /* hover:field-definition */ stringField({
	validation: { nullable: true },
	hooks: {
		resolveInput: ({ value }) => {
			const inputValue = /* hover:input-value */ value

			void 'HOOK_BODY_MUST_NOT_LEAK'
			return inputValue
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
		onChange: ({ /* completion:on-change */ ...input }) => {
			void input
		},
	},
})
