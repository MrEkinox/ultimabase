import { expectTypeOf, test } from 'vitest'

// @ts-expect-error -- Contribution ownership remains application-internal.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- The invalid import proves the source export stays absent.
import type { OwnedEnforcementContribution } from '../../index.js'

// @ts-expect-error -- Low-level policy evaluation is not a public Runtime stage factory.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- The invalid import proves the source export stays absent.
import { evaluateEnforcementContributions } from '../../index.js'

// @ts-expect-error -- Operation restrictions remain inside the assembled Runtime boundary.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- The invalid import proves the source export stays absent.
import { enforceOperationRestrictions } from '../../index.js'

// @ts-expect-error -- Relation policy recursion remains protected implementation state.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- The invalid import proves the source export stays absent.
import { createRelationPredicateEvaluator } from '../../index.js'

test('keeps extracted Enforcement coordinators absent from source exports', () => {
	expectTypeOf<true>().toEqualTypeOf<true>()
})
