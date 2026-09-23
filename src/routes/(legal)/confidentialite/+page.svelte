<script lang="ts">
	import { LEGAL } from '$lib/legal'

	const { publisher, host } = LEGAL
</script>

<svelte:head>
	<title>Confidentialité — BandStash</title>
</svelte:head>

<h1>Politique de confidentialité</h1>
<p class="legal-updated">Dernière mise à jour : {LEGAL.lastUpdated}</p>

<p>
	Cette page décrit les données personnelles traitées par {LEGAL.siteName}, conformément au
	règlement général sur la protection des données (RGPD) et à la loi Informatique et Libertés.
</p>

<h2>Responsable du traitement</h2>
<p>
	{publisher.name} ({publisher.legalForm}), {publisher.address}. Contact pour toute question
	ou demande relative à vos données : <a href="mailto:{publisher.email}">{publisher.email}</a>.
</p>

<h2>Données traitées</h2>
<ul>
	<li>
		<strong>Compte</strong> : pseudo, prénom et nom (facultatifs), format d'affichage du nom,
		mot de passe (conservé uniquement sous forme d'empreinte chiffrée, jamais en clair), rôle,
		groupes dont vous êtes membre. Les comptes sont créés par un administrateur : il n'y a pas
		d'inscription libre.
	</li>
	<li>
		<strong>Contenus que vous déposez</strong> : enregistrements audio (et nom du fichier
		d'origine), liens vers des vidéos YouTube, commentaires, réactions, publications, notes,
		sessions (dont les noms des participants saisis), morceaux, playlists, setlists.
	</li>
	<li>
		<strong>Agenda</strong> : événements du groupe et indisponibilités personnelles que vous
		y indiquez.
	</li>
	<li>
		<strong>Espace personnel</strong> : enregistrements que vous gardez pour vous. Ils ne
		sont visibles que par vous, tant que vous ne les publiez pas dans un groupe.
	</li>
	<li>
		<strong>Notifications</strong> générées par l'activité de vos groupes.
	</li>
	<li>
		<strong>Journaux techniques</strong> : adresse IP, date, page demandée et navigateur,
		enregistrés par le serveur web à chaque requête.
	</li>
</ul>
<p>
	Aucune donnée n'est utilisée à des fins publicitaires, de profilage ou de mesure
	d'audience, ni vendue ou cédée.
</p>

<h2>Finalités et base légale</h2>
<p>
	Ces données servent uniquement à faire fonctionner l'outil : vous authentifier, partager
	les contenus avec les membres de vos groupes, vous notifier de leur activité et assurer la
	sécurité du service (journaux techniques). Le traitement repose sur l'intérêt légitime de
	l'association à fournir à ses membres un outil de travail commun (article 6.1.f du RGPD).
</p>

<h2>Qui y a accès</h2>
<ul>
	<li>
		Les <strong>membres de chacun de vos groupes</strong> voient ce que vous y déposez, ainsi
		que votre nom affiché. Les membres des groupes auxquels vous appartenez voient vos
		indisponibilités d'agenda.
	</li>
	<li>
		Les <strong>administrateurs</strong> de la plateforme gèrent les comptes et les groupes.
		Ils n'ont pas accès aux espaces personnels.
	</li>
	<li>
		<strong>{host.name}</strong>, hébergeur du serveur ({host.serverLocation}), en qualité de
		sous-traitant technique.
	</li>
</ul>

<h2>Services tiers : YouTube</h2>
<p>
	Les vidéos YouTube ne sont jamais copiées sur nos serveurs. Lorsqu'une page affiche une
	vidéo (prise vidéo, publication) ou la vignette d'une vidéo citée dans un commentaire,
	votre navigateur contacte les serveurs de Google (YouTube), qui reçoivent alors votre
	adresse IP. Nous utilisons le mode de confidentialité renforcée
	(<code>youtube-nocookie.com</code>), et le lecteur d'une vidéo citée dans un commentaire
	n'est chargé qu'au clic. En lançant une vidéo, vous êtes soumis à la
	<a href="https://policies.google.com/privacy" rel="noopener noreferrer" target="_blank">politique de confidentialité de Google</a>.
</p>

<h2>Durées de conservation</h2>
<ul>
	<li>Compte : jusqu'à sa suppression, à votre demande ou à votre départ de l'association.</li>
	<li>
		Contenus : tant qu'ils ne sont pas supprimés par leur auteur, par un administrateur ou
		avec le groupe auquel ils appartiennent. Votre espace personnel est supprimé avec votre
		compte.
	</li>
	<li>Fichiers en attente de découpe : 7 jours au plus.</li>
	<li>Journaux techniques du serveur web : {LEGAL.accessLogRetentionDays} jours au plus.</li>
</ul>
<p>
	À la suppression d'un compte, les contenus partagés dans un groupe (prises, commentaires,
	sessions) y restent sous le nom affiché au moment de leur dépôt, car ils font partie du
	travail commun du groupe. Vous pouvez en demander la suppression ou l'anonymisation.
</p>

<h2>Cookies et stockage local</h2>
<p>
	{LEGAL.siteName} n'utilise que des cookies strictement nécessaires à son fonctionnement,
	dispensés de consentement (article 82 de la loi Informatique et Libertés). Aucun cookie de
	mesure d'audience ni de publicité n'est déposé.
</p>
<dl>
	<dt><code>band_session</code></dt>
	<dd>Maintient votre connexion. 30 jours.</dd>
	<dt><code>band_group</code></dt>
	<dd>Mémorise le groupe actif. 1 an.</dd>
	<dt><code>band_group_switched</code></dt>
	<dd>Annonce une fois le changement de groupe actif après l'ouverture d'un lien. 30 secondes.</dd>
	<dt>Stockage local (IndexedDB)</dt>
	<dd>
		Copie de secours d'un enregistrement en cours, dans votre navigateur uniquement, effacée
		dès que le fichier est reçu par le serveur.
	</dd>
</dl>

<h2>Sécurité</h2>
<p>
	Les échanges sont chiffrés (HTTPS), les mots de passe sont conservés sous forme d'empreinte
	(scrypt) et chaque fichier audio n'est servi qu'après vérification de votre session et de
	votre appartenance au groupe concerné.
</p>

<h2>Vos droits</h2>
<p>
	Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation,
	d'opposition et de portabilité sur vos données. Vous pouvez modifier vous-même votre pseudo,
	vos nom et prénom et votre mot de passe depuis votre <a href="/profile">profil</a>, et
	supprimer vos enregistrements, publications, sessions et setlists depuis l'application.
	Pour toute autre demande (copie de vos données, suppression d'un commentaire ou du
	compte…), écrivez à <a href="mailto:{publisher.email}">{publisher.email}</a> ; une réponse vous sera apportée dans un délai d'un mois.
</p>
<p>
	Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à
	la CNIL (<a href="https://www.cnil.fr/fr/plaintes" rel="noopener noreferrer" target="_blank">cnil.fr/fr/plaintes</a>).
</p>
