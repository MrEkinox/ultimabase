export type ExampleLinkKind = 'Concept' | 'Reference' | 'Task guide'
export type ExampleSourceKind =
	'Application code' | 'Repository instructions' | 'Test helper'

export interface ExampleDocumentationLink {
	readonly href: string
	readonly kind: ExampleLinkKind
	readonly label: string
}

export interface ExampleSourceRegion {
	readonly endLine: number
	readonly expectedText: string
	readonly kind: ExampleSourceKind
	readonly label: string
	readonly path: string
	readonly startLine: number
}

export interface ExampleScenario {
	readonly code: string
	readonly codeLabel: string
	readonly documentation: readonly ExampleDocumentationLink[]
	readonly index: string
	readonly outcome: string
	readonly slug: string
	readonly sources: readonly ExampleSourceRegion[]
	readonly steps: readonly string[]
	readonly summary: string
	readonly title: string
}
