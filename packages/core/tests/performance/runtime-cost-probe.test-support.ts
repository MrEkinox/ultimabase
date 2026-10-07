import type * as RuntimePipelineModule from '../../src/runtime/pipeline/runtime-pipeline.js'
import { vi } from 'vitest'
import type { RuntimePipelineStages } from '../../src/runtime/pipeline/contracts.js'
import { measureRuntimeStages } from './runtime-cost-counter.test-support.js'

// Only test module loading intercepts construction. Production has no metrics seam.
vi.mock(
	'../../src/runtime/pipeline/runtime-pipeline.js',
	async (importOriginal) => {
		const actual = await importOriginal<typeof RuntimePipelineModule>()
		return {
			...actual,
			RuntimePipeline: class extends actual.RuntimePipeline {
				constructor(stages: RuntimePipelineStages) {
					super(measureRuntimeStages(stages))
				}
			},
		}
	},
)

export {
	RuntimeCostProbe,
	assertNoOptionalRuntimeCost,
	diffRuntimeCostSnapshots,
	type RuntimeCostSnapshot,
} from './runtime-cost-counter.test-support.js'
