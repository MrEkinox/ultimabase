import { documentationPath } from '../../lib/docs-versions'
import { ButtonLink, TextLink } from '../primitives'

export interface TranslationFallbackProps {
	readonly englishUrl: string
	readonly returnLabel?: string
	readonly returnUrl?: string
}

export function TranslationFallback({
	englishUrl,
	returnLabel = 'Documentation française',
	returnUrl = documentationPath('fr'),
}: TranslationFallbackProps) {
	return (
		<div className="ub-translation-fallback">
			<p className="ub-section-index">Traduction en attente</p>
			<h1>Cette page n’est pas encore disponible en français.</h1>
			<p>
				La version anglaise reste la source complète. Vous pouvez la consulter
				maintenant ou revenir à l’accueil de la documentation française.
			</p>
			<div className="ub-action-row">
				<ButtonLink href={englishUrl}>Lire la source anglaise</ButtonLink>
				<TextLink href={returnUrl} prefetch={false}>
					{returnLabel}
				</TextLink>
			</div>
		</div>
	)
}
