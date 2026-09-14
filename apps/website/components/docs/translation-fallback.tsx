import { ButtonLink, TextLink } from '../primitives'

export interface TranslationFallbackProps {
	readonly englishUrl: string
}

export function TranslationFallback({ englishUrl }: TranslationFallbackProps) {
	return (
		<div className="ub-translation-fallback">
			<p className="ub-section-index">Traduction en attente</p>
			<h1>Cette page n’est pas encore disponible en français.</h1>
			<p>
				La version anglaise reste la source complète. Vous pouvez la consulter
				maintenant ou revenir à l’accueil de la documentation française.
			</p>
			<div className="ub-action-row">
				<ButtonLink href={englishUrl}>Read the English source</ButtonLink>
				<TextLink href="/fr/docs">Documentation française</TextLink>
			</div>
		</div>
	)
}
