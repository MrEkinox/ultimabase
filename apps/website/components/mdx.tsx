import * as FileComponents from 'fumadocs-ui/components/files'
import { Step, Steps } from 'fumadocs-ui/components/steps'
import * as TabsComponents from 'fumadocs-ui/components/tabs'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'

import { Mermaid } from './mermaid'

export function getMdxComponents(components?: MDXComponents): MDXComponents {
	return {
		...defaultMdxComponents,
		...FileComponents,
		...TabsComponents,
		Step,
		Steps,
		Mermaid,
		...components,
	}
}

export const useMDXComponents = getMdxComponents

declare global {
	type MDXProvidedComponents = ReturnType<typeof getMdxComponents>
}
