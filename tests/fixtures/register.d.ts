// ADR-0297 amendment 1 requires one `Register` declaration per program. The
// test program holds hundreds of applications, so it declares one application
// without schemas: every test keeps structural types, exactly as without
// `Register`. Name-keyed types are tested by language-service fixtures that
// declare their own application.
import type { UltimaBase } from '@ultimabase/core'
import type { UltimaBase as SourceUltimaBase } from '../../packages/core/src/index.js'

declare module '@ultimabase/core' {
	interface Register {
		readonly app: UltimaBase<readonly []>
	}
}

declare module '../../packages/core/src/index.js' {
	interface Register {
		readonly app: SourceUltimaBase<readonly []>
	}
}
