import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ExampleScenarioPage } from '../../../../../components/examples/examples-page'
import {
	exampleScenarios,
	findExampleScenario,
} from '../../../../../components/examples/content'
import { isSiteLocale } from '../../../../../lib/i18n'
import { createPublicPageMetadata } from '../../../../../lib/metadata'

interface ScenarioPageProps {
	readonly params: Promise<{ readonly lang: string; readonly scenario: string }>
}

export function generateStaticParams() {
	return exampleScenarios.map((scenario) => ({ scenario: scenario.slug }))
}

export async function generateMetadata({
	params,
}: ScenarioPageProps): Promise<Metadata> {
	const { lang, scenario: slug } = await params
	const scenario = findExampleScenario(slug)
	if (!isSiteLocale(lang) || lang !== 'en' || scenario === undefined) notFound()

	return createPublicPageMetadata({
		canonicalPath: `/examples/${scenario.slug}`,
		description: scenario.summary,
		locale: lang,
		title: scenario.title,
	})
}

export default async function ScenarioPage({ params }: ScenarioPageProps) {
	const { lang, scenario: slug } = await params
	const scenario = findExampleScenario(slug)
	if (!isSiteLocale(lang) || lang !== 'en' || scenario === undefined) notFound()

	return <ExampleScenarioPage scenario={scenario} />
}
