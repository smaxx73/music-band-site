<script lang="ts">
	import EnhanceSpectrumChart from '$lib/components/EnhanceSpectrumChart.svelte'
	import EnhanceDynamicsChart from '$lib/components/EnhanceDynamicsChart.svelte'
	import {
		EXPERT_PARAMS,
		expertValues,
		formatDb,
		noiseMeasurable,
		normalizeSettings,
		type AudioAnalysis,
		type EnhancePlan,
		type EnhanceSettings,
		type ExpertParam
	} from '$lib/audio-enhance'

	/**
	 * Mode expert de l'amélioration du son : chaque valeur de la chaîne en curseur, par
	 * étage, avec le graphique qui en montre l'effet avant tout rendu. Un curseur part de
	 * la valeur que les trois choix par paliers lui donnent ; « rétablir » l'y ramène.
	 */
	let {
		analysis,
		settings,
		plan,
		locked,
		profileState,
		onChange
	}: {
		analysis: AudioAnalysis
		settings: EnhanceSettings
		plan: EnhancePlan
		/** Prise déjà améliorée, ou opération en cours : les réglages se lisent sans se changer. */
		locked: boolean
		/** Le profil (spectre, bruit de fond) se mesure à la première ouverture du mode expert. */
		profileState: 'loading' | 'failed' | 'ready'
		onChange: (settings: EnhanceSettings) => void
	} = $props()

	const values = $derived(expertValues(analysis, settings))
	const defaults = $derived(expertValues(analysis, { ...settings, expert: undefined }))
	const profile = $derived(analysis.profile)

	function isSet(name: ExpertParam) {
		return settings.expert?.[name] !== undefined
	}

	function set(name: ExpertParam, value: number) {
		const expert = { ...settings.expert }
		// Revenu sur la valeur d'origine, le réglage n'en est plus un : la prise suit de
		// nouveau sa mesure, ici comme sur celles qui reprendront ces réglages.
		if (value === defaults[name]) delete expert[name]
		else expert[name] = value
		onChange(normalizeSettings({ ...settings, expert }))
	}

	function reset(name: ExpertParam) {
		const expert = { ...settings.expert }
		delete expert[name]
		onChange(normalizeSettings({ ...settings, expert }))
	}

	function setTrack(on: boolean) {
		const expert = { ...settings.expert }
		if (on) expert.denoise_track = true
		else delete expert.denoise_track
		onChange(normalizeSettings({ ...settings, expert }))
	}

	const db = (value: number) => formatDb(value, 'dB')
	const plain = (unit: string) => (value: number) => `${value.toLocaleString('fr-FR')} ${unit}`
</script>

{#snippet fine(name: ExpertParam, label: string, format: (value: number) => string, disabled = false)}
	{@const spec = EXPERT_PARAMS[name]}
	<div class="fine" class:changed={isSet(name)}>
		<label for="expert-{name}">{label}</label>
		<input
			id="expert-{name}"
			type="range"
			min={spec.min}
			max={spec.max}
			step={spec.step}
			value={values[name]}
			disabled={locked || disabled}
			aria-valuetext={format(values[name])}
			oninput={(e) => set(name, Number(e.currentTarget.value))}
		/>
		<output for="expert-{name}">{format(values[name])}</output>
		{#if isSet(name) && !locked}
			<button
				type="button"
				class="btn-link btn-link-muted reset"
				onclick={() => reset(name)}
				title="Revenir à {format(defaults[name])}"
			>rétablir</button>
		{/if}
	</div>
{/snippet}

<div class="expert">
	<section>
		<h4>Débruitage</h4>
		{#if profile}
			<p class="note">
				Passages les plus calmes à {db(profile.quiet_db)}, soit
				{(profile.loud_db - profile.quiet_db).toLocaleString('fr-FR')} dB sous les passages forts.
				{#if noiseMeasurable(profile)}
					C'est le bruit de fond : le seuil proposé se cale juste au-dessus.
				{:else}
					Cette prise n'a pas de vrai blanc : ses passages calmes sont encore de la musique, et le
					bruit de fond ne s'y mesure pas. Le seuil proposé est prudent — à régler à l'oreille.
				{/if}
			</p>
		{/if}
		{@render fine('denoise_db', 'Réduction du bruit', (v) => (v === 0 ? 'aucune' : db(-v)))}
		{#if values.denoise_db > 0}
			{@render fine('denoise_floor_db', 'Seuil du bruit', db)}
			<label class="check">
				<input
					type="checkbox"
					checked={settings.expert?.denoise_track === true}
					disabled={locked}
					onchange={(e) => setTrack(e.currentTarget.checked)}
				/>
				Réévaluer le bruit au fil du morceau
			</label>
			<p class="note">
				Ce qui passe sous le seuil est atténué de la réduction choisie. Trop fort, ou seuil trop
				haut, le débruitage ternit les cymbales et laisse un son métallique sur les fins de notes :
				c'est là qu'il faut tendre l'oreille en comparant.
			</p>
		{/if}
	</section>

	<section>
		<h4>Timbre</h4>
		{@render fine('highpass_hz', 'Coupe-bas', (v) => (v === 0 ? 'aucun' : `sous ${v} Hz`))}
		{@render fine('bass_db', 'Grave', (v) => (v === 0 ? 'tel quel' : `${db(v)} ${v < 0 ? 'sous 100 Hz' : 'à 90 Hz'}`))}
		{@render fine('mud_db', 'Carton (280 Hz)', db)}
		{@render fine('presence_db', 'Présence (3 kHz)', db)}
		{@render fine('air_db', 'Air (dès 7 kHz)', db)}
		{#if profile}
			<EnhanceSpectrumChart {profile} {plan} />
		{:else}
			<p class="note">
				{profileState === 'failed' ? 'Le spectre de cette prise n’a pas pu être mesuré.' : 'Mesure du spectre… quelques secondes.'}
			</p>
		{/if}
	</section>

	<section>
		<h4>Compression</h4>
		{#if plan.compressor}
			{@render fine('ratio', 'Taux', (v) => `${v.toLocaleString('fr-FR')}:1`)}
			{@render fine('threshold_db', 'Seuil', db)}
			{@render fine('attack_ms', 'Attaque', plain('ms'))}
			{@render fine('release_ms', 'Relâchement', plain('ms'))}
			{#if profile}
				<EnhanceDynamicsChart {profile} compressor={plan.compressor} preGainDb={plan.pre_gain_db} />
			{/if}
		{:else}
			<p class="note">La compression est coupée : pour la régler, choisis « Oui » plus haut.</p>
		{/if}
	</section>

	<section>
		<h4>Volume</h4>
		{@render fine('target_lufs', 'Volume visé', (v) => formatDb(v, 'LUFS'))}
		{@render fine('limit_db', 'Plafond des crêtes', (v) => formatDb(v, 'dBFS'))}
	</section>
</div>

<style>
	.expert { display: flex; flex-direction: column; gap: 1.1rem; }
	section { display: flex; flex-direction: column; gap: 0.45rem; }
	h4 { margin: 0; font-size: var(--text-sm); font-weight: 600; }
	.note { margin: 0; font-size: var(--text-xs); color: var(--color-text-secondary); }

	.fine {
		display: grid;
		grid-template-columns: 9.5rem minmax(0, 1fr) 8.5rem 3.6rem;
		align-items: center;
		gap: 0.2rem 0.7rem;
		font-size: var(--text-sm);
	}
	.fine input { width: 100%; min-width: 0; accent-color: var(--color-accent); }
	.fine output { font-variant-numeric: tabular-nums; color: var(--color-text-secondary); }
	.fine.changed output { color: var(--color-text); font-weight: 600; }
	.reset { font-size: var(--text-xs); justify-self: start; }

	.check { display: inline-flex; align-items: center; gap: 0.45rem; font-size: var(--text-sm); }
	.check input { accent-color: var(--color-accent); }

	/* Fenêtre étroite : le libellé et la valeur passent au-dessus du curseur. */
	@media (max-width: 640px) {
		.fine { grid-template-columns: minmax(0, 1fr) auto auto; }
		.fine input { grid-column: 1 / -1; grid-row: 2; }
	}
</style>
