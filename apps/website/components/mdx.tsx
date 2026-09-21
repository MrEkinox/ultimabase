import * as FileComponents from 'fumadocs-ui/components/files'
import { Step, Steps } from 'fumadocs-ui/components/steps'
import * as TabsComponents from 'fumadocs-ui/components/tabs'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'
import type { ComponentProps } from 'react'

import { Mermaid } from './mermaid'

// Keyboard users must be able to reach and scroll wide documentation tables.
const Table = (props: ComponentProps<'table'>) => (
	<div
		aria-label="Scrollable table"
		className="relative overflow-auto prose-no-margin my-6"
		role="region"
		tabIndex={0}
	>
		<table {...props} />
	</div>
)

export function getMdxComponents(components?: MDXComponents): MDXComponents {
	return {
		...defaultMdxComponents,
		...FileComponents,
		...TabsComponents,
		Step,
		Steps,
		Mermaid,
		table: Table,
		...components,
	}
}

export const useMDXComponents = getMdxComponents

declare global {
	type MDXProvidedComponents = ReturnType<typeof getMdxComponents>
}
