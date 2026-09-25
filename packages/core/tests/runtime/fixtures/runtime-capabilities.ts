import {
	provideRuntimeConstraint,
	provideRuntimeInterceptor,
	type RuntimeConstraintDefinition,
	type RuntimeInterceptorDefinition,
} from '../../../src/runtime/index.js'

/** Materializes one immutable interceptor definition for a focused Runtime fixture. */
export const provideTestRuntimeInterceptor = (
	contributionId: string,
	definition: RuntimeInterceptorDefinition,
) =>
	provideRuntimeInterceptor({
		contributionId,
		create: () => ({ value: definition }),
	})

/** Materializes one immutable monotonic definition for a focused Runtime fixture. */
export const provideTestRuntimeConstraint = (
	contributionId: string,
	definition: RuntimeConstraintDefinition,
) =>
	provideRuntimeConstraint({
		contributionId,
		create: () => ({ value: definition }),
	})

/** Collects several exact monotonic providers without recreating a setup registry. */
export const createTestRuntimeConstraints = (
	declare: (
		provide: (name: string, definition: RuntimeConstraintDefinition) => void,
	) => void,
) => {
	const provides: ReturnType<typeof provideTestRuntimeConstraint>[] = []
	declare((name, definition) => {
		provides.push(provideTestRuntimeConstraint(name, definition))
	})
	return provides
}
