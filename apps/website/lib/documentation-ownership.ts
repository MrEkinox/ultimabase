import { z } from 'zod'

const areaSchema = z.object({
	id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
	packages: z.array(z.string().regex(/^@ultimabase\/[a-z0-9-]+$/u)).min(1),
	sections: z
		.array(
			z
				.string()
				.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/u),
		)
		.min(1),
})

const ownershipSchema = z.object({
	areas: z.array(areaSchema).min(1),
	version: z.literal(2),
})

export type DocumentationOwnership = z.infer<typeof ownershipSchema>

/** Validates complete, unambiguous routing from public packages to website areas. */
export function validateDocumentationOwnership(
	input: unknown,
	expectedPackages: readonly string[],
	expectedSections: readonly string[],
): readonly string[] {
	const parsed = ownershipSchema.safeParse(input)
	if (!parsed.success) {
		return parsed.error.issues.map(
			(issue) =>
				`Invalid documentation ownership at ${issue.path.join('.') || 'root'}: ${issue.message}`,
		)
	}

	const diagnostics: string[] = []
	const areaIds = new Set<string>()
	const packageOwners = new Map<string, string>()
	const expectedPackageSet = new Set(expectedPackages)
	const expectedSectionSet = new Set(expectedSections)

	for (const area of parsed.data.areas) {
		if (areaIds.has(area.id)) {
			diagnostics.push(`Duplicate documentation ownership area: ${area.id}`)
		}
		areaIds.add(area.id)

		for (const packageName of area.packages) {
			const existing = packageOwners.get(packageName)
			if (existing !== undefined) {
				diagnostics.push(
					`Public package ${packageName} is owned by both ${existing} and ${area.id}`,
				)
			} else {
				packageOwners.set(packageName, area.id)
			}
			if (!expectedPackageSet.has(packageName)) {
				diagnostics.push(
					`Unknown public package in documentation ownership: ${packageName}`,
				)
			}
		}

		for (const section of new Set(area.sections)) {
			const topLevelSection = section.split('/')[0]
			if (
				topLevelSection === undefined ||
				!expectedSectionSet.has(topLevelSection)
			) {
				diagnostics.push(
					`Unknown website section in documentation ownership: ${section}`,
				)
			}
		}
		if (new Set(area.sections).size !== area.sections.length) {
			diagnostics.push(
				`Duplicate website section in ownership area: ${area.id}`,
			)
		}
	}

	for (const packageName of expectedPackages) {
		if (!packageOwners.has(packageName)) {
			diagnostics.push(
				`Documentation ownership is missing package: ${packageName}`,
			)
		}
	}

	return diagnostics
}
