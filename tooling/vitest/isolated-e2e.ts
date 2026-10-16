/**
 * E2E suites whose wall-clock budget does not survive sharing the CPU with
 * the parallel E2E run. The `e2e-isolated` Vitest project runs them after the
 * other E2E projects, one file at a time; `tooling/ci/run.ts` routes them to
 * that project.
 *
 * `create-app-packed` builds one generated project per official plugin under
 * a 120 s budget: about 35 s alone, but beyond 118 s beside the full E2E run.
 */
export const isolatedE2eSuites: readonly string[] = [
	'packages/create-app/tests/e2e/create-app-packed.e2e.test.ts',
]
