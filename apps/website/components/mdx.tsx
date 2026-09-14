import * as FileComponents from 'fumadocs-ui/components/files'
import * as TabsComponents from 'fumadocs-ui/components/tabs'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'

import { ArchitectureDiagram } from './docs/architecture-diagram'

export function getMdxComponents(components?: MDXComponents): MDXComponents {
	return {
		...defaultMdxComponents,
		...FileComponents,
		...TabsComponents,
		ArchitectureDiagram,
		...components,
	}
}

export const useMDXComponents = getMdxComponents

declare global {
	type MDXProvidedComponents = ReturnType<typeof getMdxComponents>
}
