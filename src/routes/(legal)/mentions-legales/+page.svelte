<script lang="ts">
	import { LEGAL } from '$lib/legal'

	const { publisher, host } = LEGAL
</script>

<svelte:head>
	<title>Mentions légales — BandStash</title>
</svelte:head>

<h1>Mentions légales</h1>
<p class="legal-updated">Dernière mise à jour : {LEGAL.lastUpdated}</p>

<p>
	Informations fournies en application de l'article 6 de la loi n° 2004-575 du 21 juin 2004
	pour la confiance dans l'économie numérique (LCEN).
</p>

<h2>Éditeur du site</h2>
<dl>
	<dt>Site</dt>
	<dd>{LEGAL.siteName} — <a href={LEGAL.siteUrl}>{LEGAL.siteUrl.replace('https://', '')}</a></dd>
	<dt>Éditeur</dt>
	<dd>{publisher.name}, {publisher.legalForm}</dd>
	<dt>Siège social</dt>
	<dd>{publisher.address}</dd>
	<dt>N° RNA</dt>
	<dd>{publisher.rna}</dd>
	<dt>N° SIREN</dt>
	<dd>{publisher.siren}</dd>
	<dt>Site de l'association</dt>
	<dd><a href={publisher.website} rel="noopener noreferrer" target="_blank">{publisher.website.replace('https://', '')}</a></dd>
	<dt>Contact</dt>
	<dd><a href="mailto:{publisher.email}">{publisher.email}</a></dd>
	<dt>Directeur de la publication</dt>
	<dd>{LEGAL.publicationDirector}</dd>
</dl>

<h2>Hébergeur</h2>
<dl>
	<dt>Hébergeur</dt>
	<dd>{host.name}</dd>
	<dt>Adresse</dt>
	<dd>{host.address}</dd>
	<dt>Téléphone</dt>
	<dd>{host.phone}</dd>
	<dt>Site</dt>
	<dd><a href={host.website} rel="noopener noreferrer" target="_blank">{host.website.replace('https://', '')}</a></dd>
</dl>

<h2>Objet du site</h2>
<p>
	{LEGAL.siteName} est un outil privé, sans publicité et non commercial, mis à disposition par
	l'association à ses membres pour partager les enregistrements de répétition de leurs groupes,
	suivre leurs morceaux et organiser leurs sessions. En dehors de la page d'accueil et des
	présentes pages, son contenu n'est accessible qu'aux titulaires d'un compte, et seulement
	pour les groupes dont ils sont membres.
</p>

<h2>Contenus publiés par les membres</h2>
<p>
	Les enregistrements, commentaires, publications et autres contenus déposés restent la
	propriété de leurs auteurs. Chaque membre s'engage à ne déposer que des contenus qu'il a
	le droit de partager et qui respectent les droits des tiers (droit d'auteur, droit à
	l'image, vie privée). Les enregistrements de reprises sont partagés dans le cadre privé
	du groupe et ne sont pas diffusés publiquement.
</p>
<p>
	Tout contenu manifestement illicite peut être signalé à <a href="mailto:{publisher.email}">{publisher.email}</a>,
	en précisant sa localisation (adresse de la page) et la raison du signalement.
	L'association le retirera promptement s'il s'avère illicite.
</p>

<h2>Propriété intellectuelle</h2>
<p>
	Le nom {LEGAL.siteName}, son logo et le code de l'application ne peuvent être reproduits
	sans autorisation. Les vidéos YouTube intégrées restent la propriété de leurs auteurs et
	sont lues depuis YouTube, sans copie sur nos serveurs.
</p>

<h2>Données personnelles et cookies</h2>
<p>
	Le traitement des données personnelles et l'usage des cookies sont décrits dans la
	<a href="/confidentialite">politique de confidentialité</a>.
</p>
