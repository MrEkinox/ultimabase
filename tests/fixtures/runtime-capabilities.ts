import {
	provideRuntimeConstraint,
	provideRuntimeInterceptor,
	provideRuntimeObserver,
	type RuntimeConstraintDefinition,
	type RuntimeInterceptorDefinition,
	type RuntimeObserverDefinition,
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

export const provideTestRuntimeObserver = (
	contributionId: string,
	definition: RuntimeObserverDefinition,
) =>
	provideRuntimeObserver({
		contributionId,
		create: () => ({ value: definition }),
	})
