import {
	provideRuntimeConstraint,
	provideRuntimeInterceptor,
	type RuntimeConstraintDefinition,
	type RuntimeInterceptorDefinition,
} from '@ultimabase/core'

export const provideTestRuntimeInterceptor = (
	contributionId: string,
	definition: RuntimeInterceptorDefinition,
) =>
	provideRuntimeInterceptor({
		contributionId,
		create: () => ({ value: definition }),
	})

export const provideTestRuntimeConstraint = (
	contributionId: string,
	definition: RuntimeConstraintDefinition,
) =>
	provideRuntimeConstraint({
		contributionId,
		create: () => ({ value: definition }),
	})
