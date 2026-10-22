<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import enemies from '../lib/data/dfu-enemies.json';
  import { norm } from '../lib/map/search';
  import Sprite from './Sprite.svelte';
  import { DUNGEON_TYPES, REGION_NAMES } from '../lib/df/constants';
  import { CLIMATE_LABEL, WILD_TIME_LABEL, encounterOdds, tableFor, type ClimateKey, type WildTime } from '../lib/df/encounters';
  import { regionOdds } from '../lib/df/regionEncounters';

  interface Enemy {
    id: number; name: string; level?: number; hp?: [number, number]; dmg?: [number, number]; armor?: number;
    metal: string; affinity: string; behaviour: string; team?: string; loot?: string; soul?: number; texture?: number;
  }
  const all = enemies as Enemy[];

  let q = $state('');
  let show = $state<'all' | 'slain' | 'unslain'>('all');
  let kind = $state<'all' | 'monster' | 'class'>('all');
  let band = $state<'all' | 'low' | 'mid' | 'high'>('all');

  // ---- "where": a habitat or a region, with odds at the current level ----
  let regionTime = $state<WildTime>('wild-day');
  const where = $derived(app.bestiaryWhere);
  const odds = $derived.by((): Map<number, number> | null => {
    if (!where) return null;
    const lvl = app.encounterLevel;
    if (where.startsWith('region:')) {
      const facts = app.game?.regionFacts(Number(where.slice(7)));
      return facts ? regionOdds(facts, regionTime, lvl) : null;
    }
    return encounterOdds(tableFor(where), lvl);
  });
  const whereLabel = $derived.by(() => {
    if (!where) return '';
    if (where.startsWith('region:')) return `${REGION_NAMES[Number(where.slice(7))]} wilderness`;
    const [k, a, b] = where.split(':');
    if (k === 'dungeon') return DUNGEON_TYPES[Number(a)];
    if (k === 'wild') return `${CLIMATE_LABEL[a as ClimateKey]} · ${WILD_TIME_LABEL[b as WildTime]}`;
    if (k === 'water') return 'Underwater';
    return 'Indoors';
  });
  const selRegion = $derived(app.selection?.t === 'region' ? app.selection.region : null);
  function setWhere(v: string) { app.bestiaryWhere = v || null; }

  const list = $derived(all.filter((e) => {
    if (odds && !odds.has(e.id)) return false;
    if (q && !norm(e.name).includes(norm(q))) return false;
    if (kind === 'monster' && e.id >= 128) return false;
    if (kind === 'class' && e.id < 128) return false;
    const slain = app.kills.get(e.id)?.slain ?? false;
    if (show === 'slain' && !slain) return false;
    if (show === 'unslain' && slain) return false;
    if (band !== 'all') {
      const l = e.level ?? 0;
      if (!e.level) return false;
      if (band === 'low' && l > 6) return false;
      if (band === 'mid' && (l < 7 || l > 14)) return false;
      if (band === 'high' && l < 15) return false;
    }
    return true;
  }).sort((a, b) => (odds ? (odds.get(b.id) ?? 0) - (odds.get(a.id) ?? 0) : 0)));
  const slainCount = $derived(all.filter((e) => app.kills.get(e.id)?.slain).length);

  const METAL: Record<string, string> = { None: '', Iron: 'Iron', Steel: 'Steel', Silver: 'Silver', Elven: 'Elven', Dwarven: 'Dwarven', Mithril: 'Mithril', Adamantium: 'Adamantium', Ebony: 'Ebony', Orcish: 'Orcish', Daedric: 'Daedric' };
  const selected = $derived(app.selection?.t === 'creature' ? app.selection.id : null);
</script>

<div class="page">
  <header class="row wrap">
    <select value={where ?? ''} onchange={(e) => setWhere((e.target as HTMLSelectElement).value)} aria-label="Where">
      <option value="">All creatures</option>
      {#if where?.startsWith('region:')}<option value={where}>{whereLabel}</option>{/if}
      {#if selRegion !== null && where !== `region:${selRegion}`}<option value={`region:${selRegion}`}>{REGION_NAMES[selRegion]} wilderness</option>{/if}
      <optgroup label="Dungeons">{#each DUNGEON_TYPES as d, i}<option value={`dungeon:${i}`}>{d}</option>{/each}</optgroup>
      {#each Object.entries(CLIMATE_LABEL) as [c, label]}
        <optgroup label={label}>{#each Object.entries(WILD_TIME_LABEL) as [t, tl]}<option value={`wild:${c}:${t}`}>{label} · {tl}</option>{/each}</optgroup>
      {/each}
      <optgroup label="Other"><option value="water">Underwater</option><option value="building:default">Indoors: shops</option><option value="building:guild">Indoors: guild halls</option><option value="building:temple">Indoors: temples</option><option value="building:palace">Indoors: palaces & houses</option></optgroup>
    </select>
    {#if where?.startsWith('region:')}
      <div class="seg">{#each Object.entries(WILD_TIME_LABEL) as [t, tl]}<button class="small" class:on={regionTime === t} onclick={() => (regionTime = t as WildTime)}>{tl.replace('Wilderness, ', '')}</button>{/each}</div>
    {/if}
    <label class="row small" title={app.boundSave?.character ? 'From your bound save' : 'Used for encounter odds'}>Level
      {#if app.boundSave?.character}<strong>{app.encounterLevel}</strong>
      {:else}<input type="number" min="1" max="30" class="lvl" bind:value={app.settings.bestiary.level} onchange={() => app.saveSettings()} />{/if}
    </label>
    <span class="muted small">{slainCount}/{all.length} slain{app.activeProfile ? ` in ${app.activeProfile.name}` : ''}</span>
    <span class="spacer"></span>
    <input type="search" placeholder="Filter…" bind:value={q} />
    <select bind:value={kind}><option value="all">All</option><option value="monster">Monsters</option><option value="class">Humanoid classes</option></select>
    <select bind:value={band}><option value="all">Any level</option><option value="low">Level 1–6</option><option value="mid">7–14</option><option value="high">15+</option></select>
    <select bind:value={show}><option value="all">Slain or not</option><option value="slain">Slain</option><option value="unslain">Not slain</option></select>
    <label class="row small"><input type="checkbox" bind:checked={app.settings.display.killCounters} onchange={() => app.saveSettings()} /> Counters</label>
  </header>
  {#if !app.activeProfile}
    <p class="banner">Kills are tracked per playthrough. <button class="small" onclick={() => (app.showProfilePicker = true)}>Open a Profile</button> to tick creatures off. Notes you write here can still go in the Atlas.</p>
  {/if}

  <div class="grid">
    {#each list as e (e.id)}
      {@const k = app.kills.get(e.id)}
      {@const notes = app.recordsFor({ t: 'creature', id: e.id }, ['note'])}
      <div class="card creature" class:slain={k?.slain} class:sel={selected === e.id}>
        <button class="head" onclick={() => (app.selection = { t: 'creature', id: e.id })}>
          <Sprite archive={e.texture} />
          <div class="col nm">
            <strong>{e.name}</strong>
            <span class="muted small">{e.level ? `Level ${e.level}` : 'Scales with you'} · {e.affinity}</span>
          </div>
          {#if odds?.has(e.id)}<span class="odds" title={`Chance per random encounter in ${whereLabel} at level ${app.encounterLevel}`}>{Math.round(odds.get(e.id)! * 100) || '<1'}%</span>{/if}
        </button>
        <dl class="kv small">
          {#if e.hp}<dt>Health</dt><dd>{e.hp[0]}–{e.hp[1]}</dd>{/if}
          {#if e.dmg}<dt>Damage</dt><dd>{e.dmg[0]}–{e.dmg[1]}</dd>{/if}
          {#if e.armor !== undefined}<dt>Armour</dt><dd>{e.armor}</dd>{/if}
          {#if METAL[e.metal]}<dt>Hit with</dt><dd class="warn">{METAL[e.metal]} or better</dd>{/if}
          {#if e.soul}<dt>Soul</dt><dd>{e.soul.toLocaleString()}</dd>{/if}
          {#if e.loot}<dt>Loot table</dt><dd>{e.loot}</dd>{/if}
        </dl>
        {#if notes.length}<div class="note">{notes[0].kind === 'note' ? notes[0].body.split('\n')[0] : ''}{notes.length > 1 ? ` (+${notes.length - 1})` : ''}</div>{/if}
        <div class="row foot">
          <label class="row"><input type="checkbox" checked={k?.slain ?? false} disabled={!app.activeProfile} onchange={(ev) => app.setKill(e.id, { slain: (ev.target as HTMLInputElement).checked })} /> Slain</label>
          <span class="spacer"></span>
          {#if app.settings.display.killCounters && app.activeProfile}
            <button class="small" onclick={() => app.setKill(e.id, { count: (k?.count ?? 0) - 1 })} aria-label="One fewer">−</button>
            <span class="count">{k?.count ?? 0}</span>
            <button class="small" onclick={() => app.setKill(e.id, { count: (k?.count ?? 0) + 1, slain: true })} aria-label="One more">+</button>
          {/if}
          <button class="small ghost" onclick={() => (app.composer = { kind: 'note', anchor: { t: 'creature', id: e.id } })}>Note</button>
        </div>
      </div>
    {:else}
      <p class="muted">No creatures match.</p>
    {/each}
  </div>
  <p class="faint small credit">Stats from Daggerfall Unity's enemy table. Sprites are read from your ARENA2 TEXTURE files.</p>
</div>

<style>
  .page { position: absolute; inset: 0; overflow: auto; padding: 12px 16px; }
  header { margin-bottom: 12px; gap: 8px; }
  .small { font-size: 12.5px; }
  .odds { margin-left: auto; font-size: 15px; font-weight: 700; color: var(--danger); font-variant-numeric: tabular-nums; }
  .seg { display: flex; gap: 3px; }
  .seg .on { color: var(--gold); border-color: var(--gold-dim); }
  .lvl { width: 56px; }
  .banner { background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
  .creature { display: flex; flex-direction: column; gap: 8px; }
  .creature.slain { border-color: #3f5a3c; }
  .creature.sel { border-color: var(--gold-dim); }
  .head { display: flex; gap: 10px; align-items: center; background: transparent; border: 0; padding: 0; text-align: left; }
  .nm strong { color: var(--gold); }
  .nm { gap: 0; }
  .note { font-size: 12.5px; color: var(--muted); font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .foot { margin-top: auto; }
  .count { min-width: 22px; text-align: center; font-variant-numeric: tabular-nums; }
  .warn { color: var(--warn); }
  .credit { margin-top: 16px; }
</style>
