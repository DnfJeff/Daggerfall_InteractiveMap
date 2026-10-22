<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import { BLD_LABELS, BLD_NOTES, DUNGEON_TYPES, LOC_TYPES, NAMED_BUILDING_TYPES, REGION_NAMES, bldCategory, AUTOMAP_COLORS } from '../lib/df/constants';
  import { qualityBand } from '../lib/df/quality';
  import type { TownModel } from '../lib/df/town';
  import { townCanvas } from '../lib/map/layers';
  import { pathAt } from '../lib/df/roads';
  import enemies from '../lib/data/dfu-enemies.json';
  import NotesList from './NotesList.svelte';
  import PlaneBadge from './PlaneBadge.svelte';
  import Sprite from './Sprite.svelte';
  import Icon from './Icon.svelte';
  import Section from './dock/Section.svelte';
  import EncounterList from './EncounterList.svelte';
  import { CLIMATE_LABEL, WILD_TIME_LABEL, dungeonTable, encounterOdds, habitatsOf, type WildTime } from '../lib/df/encounters';
  import { regionOdds } from '../lib/df/regionEncounters';

  const g = $derived(app.game);
  const sel = $derived(app.selection);

  const loc = $derived(sel && (sel.t === 'loc' || sel.t === 'bld') ? g?.maps.locationByMapId(sel.mapId) ?? null : null);
  let town = $state.raw<TownModel | null>(null);
  $effect(() => {
    const l = loc;
    town = null;
    if (l && LOC_TYPES[l.type]?.town && g) g.town(l).then((t) => { if (loc === l) town = t; }, () => {});
  });

  const building = $derived(sel?.t === 'bld' && town ? town.buildings.find((b) => b.key === sel.key) ?? null : null);
  const record = $derived(sel?.t === 'record' ? app.records.find((r) => r.id === sel.id) ?? null : null);
  const creature = $derived(sel?.t === 'creature' ? (enemies as any[]).find((e) => e.id === sel.id) ?? null : null);

  const townStats = $derived.by(() => {
    if (!town || !loc) return null;
    void app.reveals; void app.settings.spoiler; void app.discovery;
    const counts = { guild: 0, shop: 0, tavern: 0, house: 0 };
    for (const b of town.buildings) {
      if (!b.pixelCount) continue;
      const c = bldCategory(b.type);
      if (c !== 'none') counts[c]++;
    }
    const named = town.buildings
      .filter((b) => NAMED_BUILDING_TYPES.has(b.type) && b.pixelCount && b.type !== 16)
      .map((b) => ({ b, name: app.buildingNameVisible(loc.mapId, b) ? app.buildingRealName(loc.mapId, b) : null }))
      .sort((a, c) => bldCategory(a.b.type).localeCompare(bldCategory(c.b.type)) || (a.name ?? '~').localeCompare(c.name ?? '~'));
    return { counts, named, hidden: named.filter((n) => !n.name).length };
  });

  const onRoad = $derived.by(() => {
    if (!loc || !app.roads) return null;
    const n = app.roads.networks;
    return pathAt(n.road, loc.x, loc.y) ? 'On a road' : pathAt(n.track, loc.x, loc.y) ? 'On a track' : 'Off the roads';
  });

  let thumb: HTMLCanvasElement | undefined = $state();
  $effect(() => {
    if (!thumb || !town) return;
    const src = townCanvas(town);
    const s = Math.min(150 / src.width, 110 / src.height);
    thumb.width = Math.round(src.width * s);
    thumb.height = Math.round(src.height * s);
    const ctx = thumb.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#5b5c66';
    ctx.fillRect(0, 0, thumb.width, thumb.height);
    ctx.drawImage(src, 0, 0, thumb.width, thumb.height);
  });

  const regionStats = $derived.by(() => {
    if (sel?.t !== 'region' || !g) return null;
    const by: Record<string, number> = {};
    let hidden = 0;
    for (const l of g.maps.locations) {
      if (l.region !== sel.region) continue;
      if (!app.locationVisible(l)) { hidden++; continue; }
      const k = LOC_TYPES[l.type]?.label ?? '?';
      by[k] = (by[k] ?? 0) + 1;
    }
    return { by: Object.entries(by).sort((a, b) => b[1] - a[1]), hidden };
  });

  const factionName = (id: number) => g?.factions?.get(id)?.name ?? null;
  const WILD_TIMES: WildTime[] = ['wild-day', 'wild-night', 'town-night'];
  let wildTime = $state<WildTime>('wild-day');
  const isDungeon = $derived(!!loc && LOC_TYPES[loc.type]?.layer === 'dungeons');
  /** What this place offers, from the directory (works without loading the town). */
  const services = $derived.by(() => {
    if (!loc || !g) return [];
    const entry = g.directory().towns.get(loc.mapId);
    if (!entry) return [];
    const cat = g.directory().services;
    return [...entry.offers.entries()]
      .filter(([k]) => !k.endsWith(':*'))
      .map(([k, b]) => ({ key: k, label: cat.get(k)!.label, plural: cat.get(k)!.plural, count: b.length, order: cat.get(k)!.category }))
      .sort((a, b) => a.order.localeCompare(b.order) || a.label.localeCompare(b.label));
  });
  const recent = $derived(app.visibleRecords.filter((r) => r.kind === 'note' || r.kind === 'marker' || r.kind === 'journal').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6));
</script>

<div class="insp">
  {#if !sel}
    <div class="hero"><p class="muted">Hover to identify, click to inspect, right-click to add a marker or note.</p></div>
    <Section id="insp.recent" title="Recent notes" meta={recent.length ? undefined : 'none yet'}>
      {#each recent as r (r.id)}
        <button class="rowlink" onclick={() => { app.selection = { t: 'record', id: r.id }; }}>
          <span class="dotp" style:background={app.planeColor(r.plane)}></span>
          <span class="ellip">{'name' in r ? r.name : r.body.split('\n')[0]}</span>
          <span class="faint small">{app.describeAnchor(r.anchor)}</span>
        </button>
      {:else}
        <p class="faint small">Your newest notes and markers will be listed here.</p>
      {/each}
    </Section>
    <Section id="insp.keys" title="Shortcuts" defaultOpen={false}>
      <dl class="kv small">
        <dt>Ctrl+F</dt><dd>Find a place</dd><dt>Wheel / drag</dt><dd>Zoom / pan</dd>
        <dt>Double-click</dt><dd>Open a town</dd><dt>Right-click</dt><dd>Add marker / note</dd>
        <dt>Esc</dt><dd>Clear selection</dd><dt>]</dt><dd>Toggle side panels</dd><dt>`</dt><dd>Toggle bottom dock</dd>
      </dl>
    </Section>

  {:else if sel.t === 'region'}
    {@const facts = g?.regionFacts(sel.region)}
    <div class="hero">
      <h2>{REGION_NAMES[sel.region]}</h2>
      <div class="muted small">Region{facts ? ` · ${facts.people}` : ''}</div>
    </div>
    {#if facts}
      <Section id="insp.region.facts" title="Facts">
        <dl class="kv small">
          {#if facts.ruler}<dt>Ruler</dt><dd>{facts.ruler.name ?? facts.ruler.title}</dd>{/if}
          {#if facts.capital}
            <dt>Capital</dt><dd><button class="link" onclick={() => app.goToLocation(facts.capital!)}>{facts.capital.name}</button></dd>
          {:else if facts.largest[0]}
            <dt>Largest</dt><dd><button class="link" onclick={() => app.goToLocation(facts.largest[0])}>{facts.largest[0].name}</button></dd>
          {/if}
          {#if facts.ports.length}
            <dt>Ports</dt>
            <dd>{#each facts.ports.slice(0, 4) as p, i}{i ? ', ' : ''}<button class="link" onclick={() => app.goToLocation(p)}>{p.name}</button>{/each}{facts.ports.length > 4 ? ` +${facts.ports.length - 4}` : ''}</dd>
          {:else}
            <dt>Ports</dt><dd class="faint">None (no ships for sale)</dd>
          {/if}
          {#if facts.deity}<dt>Patron temple</dt><dd>{facts.deity}</dd>{/if}
          {#if facts.climate.length}
            <dt>Climate</dt><dd>{facts.climate.filter((c) => c.share >= 0.05).map((c) => `${CLIMATE_LABEL[c.key]}${facts.climate.length > 1 ? ` ${Math.round(c.share * 100)}%` : ''}`).join(', ')}</dd>
          {/if}
          <dt>Settlements</dt><dd>{facts.counts.cities} cities, {facts.counts.towns} towns, {facts.counts.villages} villages</dd>
          <dt>Guild halls</dt><dd>{facts.counts.guilds} · temples {facts.counts.temples}</dd>
          <dt>Dungeons</dt><dd>{facts.counts.dungeons}{facts.dungeonTypes.length ? `, mostly ${facts.dungeonTypes.slice(0, 3).map(([t]) => DUNGEON_TYPES[t]).join(', ')}` : ''}</dd>
        </dl>
      </Section>
      <Section id="insp.region.enc" title="Wilderness encounters" meta={`at level ${app.encounterLevel}`}>
        <div class="seg">
          {#each WILD_TIMES as t}<button class="small" class:on={wildTime === t} onclick={() => (wildTime = t)}>{WILD_TIME_LABEL[t].replace('Wilderness, ', '')}</button>{/each}
        </div>
        <EncounterList odds={regionOdds(facts, wildTime, app.encounterLevel)} />
        <button class="small" onclick={() => { app.bestiaryWhere = `region:${sel.region}`; app.openDock('bestiary'); }}>Show this region's bestiary</button>
      </Section>
    {/if}
    {#if regionStats}
      <Section id="insp.region.places" title="Places" meta={regionStats.hidden ? `+${regionStats.hidden} hidden` : undefined}>
        <dl class="kv small">{#each regionStats.by as [k, n]}<dt>{k}</dt><dd>{n}</dd>{/each}</dl>
      </Section>
    {/if}
    <Section id="insp.notes" title="Notes"><NotesList anchor={{ t: 'region', region: sel.region }} allowMarker={false} /></Section>

  {:else if loc && sel.t === 'loc'}
    {@const blocks = g?.maps.blocksOf(loc) ?? 0}
    <div class="hero">
      <div class="row top">
        <div class="col tight">
          <h2>{loc.name}</h2>
          <div class="muted small">{LOC_TYPES[loc.type]?.label} · {REGION_NAMES[loc.region]}</div>
        </div>
        {#if town}<canvas class="thumb" bind:this={thumb} onclick={() => app.openTown(loc.mapId)} title="Open town"></canvas>{/if}
      </div>
      <div class="row wrap">
        {#if LOC_TYPES[loc.type]?.town}<button class="primary small" onclick={() => app.openTown(loc.mapId)}><Icon name="town" size={14} /> Open town</button>{/if}
        {#if app.mapLevel !== 'world'}<button class="small" onclick={() => app.goToLocation(loc)}>Show on map</button>{/if}
        <button class="small ghost" onclick={() => (app.composer = { kind: 'note', anchor: { t: 'loc', mapId: loc.mapId } })}><Icon name="plus" size={13} /> Note</button>
      </div>
      <div class="row wrap chips">
        <button class="chip-btn" class:on={app.spots.here?.anchorKey === `loc:${loc.mapId}`}
          onclick={() => app.setSpot('here', app.spots.here?.anchorKey === `loc:${loc.mapId}` ? null : { t: 'loc', mapId: loc.mapId })}>◎ I'm here</button>
        <button class="chip-btn" class:on={app.spots.home?.anchorKey === `loc:${loc.mapId}`}
          onclick={() => app.setSpot('home', app.spots.home?.anchorKey === `loc:${loc.mapId}` ? null : { t: 'loc', mapId: loc.mapId })}>⌂ Home</button>
        {#if isDungeon}
          {@const st = app.statuses.get(loc.mapId)}
          <button class="chip-btn" class:on={st === 'started'} onclick={() => app.setStatus(loc.mapId, st === 'started' ? null : 'started')}>◐ Started</button>
          <button class="chip-btn" class:on={st === 'cleared'} onclick={() => app.setStatus(loc.mapId, st === 'cleared' ? null : 'cleared')}>✓ Cleared</button>
        {/if}
      </div>
    </div>
    {#if services.length}
      <Section id="insp.loc.services" title="Services">
        <div class="row wrap svc">
          {#each services as s}
            <button class="chip" title={`Find ${s.plural.toLowerCase()} near here`} onclick={() => app.findNear(s.key, loc)}>{s.label}{s.count > 1 ? ` ×${s.count}` : ''}</button>
          {/each}
        </div>
      </Section>
    {/if}
    {#if isDungeon && loc.dungeonType !== 255}
      <Section id="insp.loc.enc" title="Encounters" meta={`${DUNGEON_TYPES[loc.dungeonType]} · level ${app.encounterLevel}`}>
        <EncounterList odds={encounterOdds(dungeonTable(loc.dungeonType), app.encounterLevel)} />
        <p class="faint small">Random spawns only; fixed monsters and quest foes are placed separately.</p>
      </Section>
    {/if}
    <Section id="insp.loc.details" title="Details">
      <dl class="kv small">
        {#if loc.dungeonType !== 255 && LOC_TYPES[loc.type]?.layer === 'dungeons'}<dt>Dungeon</dt><dd>{DUNGEON_TYPES[loc.dungeonType] ?? '?'}</dd>{/if}
        {#if blocks > 1}<dt>Size</dt><dd>{g?.maps.blockW[g.maps.byMapId.get(loc.mapId)!]}×{g?.maps.blockH[g.maps.byMapId.get(loc.mapId)!]} blocks</dd>{/if}
        <dt>Map pixel</dt><dd class="mono">{loc.x}, {loc.y}</dd>
        {#if onRoad}<dt>Roads</dt><dd>{onRoad}</dd>{/if}
        <dt>On the map</dt><dd>{loc.visibleAtStart ? 'From the start' : 'Once discovered'}</dd>
        {#if app.discovery}<dt>Your character</dt><dd>{app.locationDiscovered(loc) ? 'Knows this place' : 'Not discovered'}</dd>{/if}
      </dl>
    </Section>
    {#if townStats}
      <Section id="insp.loc.town" title="Buildings" meta={`${townStats.named.length} named${townStats.hidden ? ` · ${townStats.hidden} hidden` : ''}`}>
        <div class="row wrap counts">
          <span><i style:background={AUTOMAP_COLORS.guild}></i>{townStats.counts.guild} guilds</span>
          <span><i style:background={AUTOMAP_COLORS.shop}></i>{townStats.counts.shop} shops</span>
          <span><i style:background={AUTOMAP_COLORS.tavern}></i>{townStats.counts.tavern} taverns</span>
          <span><i style:background={AUTOMAP_COLORS.house}></i>{townStats.counts.house} houses</span>
        </div>
        <div class="col named">
          {#each townStats.named as n}
            <button class="rowlink" onclick={() => app.openTown(loc.mapId, n.b.key)}>
              <i class="sq" style:background={AUTOMAP_COLORS[bldCategory(n.b.type)]}></i>
              {#if n.name}<span class="ellip">{n.name}</span>{:else}<span class="faint ellip">{BLD_LABELS[n.b.type]} (unidentified)</span>{/if}
              <span class="spacer"></span>
              {#if app.recordsFor({ t: 'bld', mapId: loc.mapId, key: n.b.key }).length}<Icon name="note" size={13} />{/if}
            </button>
          {/each}
        </div>
        {#if townStats.hidden && !app.shopNamesShown()}
          <button class="small" onclick={() => app.setRevealed({ t: 'town', mapId: loc.mapId, x: 0, y: 0 }, true)}>Reveal {townStats.hidden} names here</button>
        {/if}
      </Section>
    {/if}
    <Section id="insp.notes" title="Notes"><NotesList anchor={{ t: 'loc', mapId: loc.mapId }} /></Section>

  {:else if loc && sel.t === 'bld'}
    {#if building}
      {@const visible = app.buildingNameVisible(loc.mapId, building)}
      {@const a = { t: 'bld' as const, mapId: loc.mapId, key: building.key }}
      <div class="hero">
        <h2>{visible ? app.buildingRealName(loc.mapId, building) : `${BLD_LABELS[building.type]}${building.name ? ' (unidentified)' : ''}`}</h2>
        <div class="muted small">{BLD_LABELS[building.type]} in <button class="link" onclick={() => (app.selection = { t: 'loc', mapId: loc.mapId })}>{loc.name}</button></div>
        <div class="row wrap">
          {#if app.mapLevel !== 'town' || app.townMapId !== loc.mapId}<button class="primary small" onclick={() => app.openTown(loc.mapId, building.key)}>Show in town</button>{/if}
          {#if building.name && !app.shopNamesShown()}
            <button class="small" onclick={() => app.setRevealed(a, !app.isRevealed(a))}>
              <Icon name={app.isRevealed(a) ? 'eyeoff' : 'eye'} size={13} /> {app.isRevealed(a) ? 'Hide name' : 'Reveal name'}
            </button>
          {/if}
        </div>
      </div>
      <Section id="insp.bld.details" title="Details">
        <dl class="kv small">
          {#if NAMED_BUILDING_TYPES.has(building.type) && ![11, 14, 16].includes(building.type)}
            {@const q = qualityBand(building.quality)}
            <dt>Quality</dt><dd>{building.quality}/20 · {q.band}<br /><span class="faint">“{q.text}”</span></dd>
          {/if}
          {#if building.factionId && factionName(building.factionId)}<dt>Faction</dt><dd>{factionName(building.factionId)}</dd>{/if}
          {#if BLD_NOTES[building.type]}<dt>Doors</dt><dd>{BLD_NOTES[building.type]}</dd>{/if}
          {#if visible && app.boundSave?.discovery.buildings.get(loc.mapId)?.get(building.key) && app.boundSave.discovery.buildings.get(loc.mapId)!.get(building.key) !== building.name}
            <dt>Vanilla name</dt><dd>{building.name || '—'} <span class="faint">(your save differs: mod or quest)</span></dd>
          {/if}
          <dt>Building key</dt><dd class="mono">{building.key}</dd>
        </dl>
      </Section>
      <Section id="insp.notes" title="Notes"><NotesList anchor={a} allowMarker={false} /></Section>
    {:else}
      <p class="muted pad">Loading building…</p>
    {/if}

  {:else if record}
    <div class="hero">
      <h2>{'name' in record ? record.name : 'title' in record ? record.title : record.kind === 'journal' ? 'Journal entry' : 'Note'}</h2>
      <div class="row wrap"><PlaneBadge plane={record.plane} /><span class="muted small">{record.kind} · {app.describeAnchor(record.anchor)}</span></div>
      <div class="row wrap">
        <button class="primary small" onclick={() => (app.composer = { kind: record.kind as any, anchor: record.anchor, recordId: record.id })}>Edit</button>
        {#if record.anchor}<button class="small" onclick={() => app.goToAnchor(record.anchor!)}>Go to</button>{/if}
        <button class="small danger" onclick={() => { app.trashRecord(record.id); app.selection = null; }} title="Move to Trash"><Icon name="trash" size={13} /></button>
      </div>
    </div>
    {#if 'body' in record && record.body}<Section id="insp.rec.body" title="Text"><div class="body">{record.body}</div></Section>{/if}
    <Section id="insp.rec.plane" title="Plane" defaultOpen={false}>
      {#if record.plane === 'atlas'}
        <button class="small" disabled={!app.activeProfile} onclick={() => app.copyToPlane(record.id, app.activeProfile!.id)}>Copy to {app.activeProfile?.name ?? 'a playthrough'}</button>
      {:else}
        <button class="small" onclick={() => app.copyToPlane(record.id, 'atlas')}>Copy to Atlas</button>
        <button class="small" onclick={() => app.moveToPlane(record.id, 'atlas')}>Promote to Atlas (move)</button>
      {/if}
    </Section>

  {:else if creature}
    {@const k = app.kills.get(creature.id)}
    <div class="hero">
      <div class="row top">
        <Sprite archive={creature.texture} size={64} />
        <div class="col tight">
          <h2>{creature.name}</h2>
          <div class="muted small">{creature.level ? `Level ${creature.level}` : 'Matches your level'} · {creature.affinity}</div>
        </div>
      </div>
      {#if app.activeProfile}
        <label class="row small"><input type="checkbox" checked={k?.slain ?? false} onchange={(e) => app.setKill(creature.id, { slain: (e.target as HTMLInputElement).checked })} /> Slain in {app.activeProfile.name}{k?.count ? ` · ${k.count} kills` : ''}</label>
      {/if}
    </div>
    <Section id="insp.creature.stats" title="Stats">
      <dl class="kv small">
        {#if creature.hp}<dt>Health</dt><dd>{creature.hp[0]}–{creature.hp[1]}</dd>{/if}
        {#if creature.dmg}<dt>Damage</dt><dd>{creature.dmg[0]}–{creature.dmg[1]}</dd>{/if}
        {#if creature.armor !== undefined}<dt>Armour</dt><dd>{creature.armor}</dd>{/if}
        {#if creature.metal && creature.metal !== 'None'}<dt>Hit with</dt><dd>{creature.metal} or better</dd>{/if}
        {#if creature.soul}<dt>Soul</dt><dd>{creature.soul.toLocaleString()}</dd>{/if}
      </dl>
    </Section>
    <Section id="insp.creature.where" title="Found in" meta={`${habitatsOf(creature.id).length} places`}>
      <div class="col habit">
        {#each habitatsOf(creature.id) as h}
          <button class="rowlink" onclick={() => { app.bestiaryWhere = h.key; app.openDock('bestiary'); }}>
            <span class="kind {h.kind}">{h.kind === 'dungeon' ? 'Dungeon' : h.kind === 'wild' ? 'Wild' : h.kind === 'water' ? 'Water' : 'Indoors'}</span>
            <span class="ellip">{h.label.replace(/^Indoors: /, '')}</span>
          </button>
        {:else}
          <p class="faint small">Not in any random-encounter table (fixed or quest placements only).</p>
        {/each}
      </div>
    </Section>
    <Section id="insp.notes" title="Notes"><NotesList anchor={{ t: 'creature', id: creature.id }} allowMarker={false} /></Section>

  {:else}
    <p class="muted pad">Nothing to show.</p>
  {/if}
</div>

<style>
  .insp { display: flex; flex-direction: column; }
  .hero { padding: 12px 12px 10px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--line-soft); }
  .hero p { margin: 0; }
  h2 { font-size: 17px; color: var(--gold); line-height: 1.2; }
  .top { align-items: flex-start; justify-content: space-between; gap: 10px; }
  .tight { gap: 2px; min-width: 0; }
  .small { font-size: 12.5px; }
  .pad { padding: 12px; }
  .hero button { display: inline-flex; align-items: center; gap: 4px; }
  .thumb { border-radius: 4px; border: 1px solid var(--line); image-rendering: pixelated; cursor: pointer; flex: none; }
  .counts { font-size: 12px; color: var(--muted); gap: 2px 10px; }
  .counts i, .sq { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; flex: none; }
  .named { gap: 0; }
  .rowlink { display: flex; align-items: center; gap: 6px; text-align: left; background: transparent; border: 0; padding: 3px 4px; font-size: 13px; border-radius: 4px; min-width: 0; }
  .rowlink:hover { background: var(--panel-3); }
  .ellip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .dotp { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .body { white-space: pre-wrap; font-size: 13px; }
  .link { background: none; border: 0; padding: 0; color: var(--gold); font-size: inherit; }
  .link:hover { text-decoration: underline; background: none; }
  .chips { gap: 4px; }
  .chip-btn { font-size: 11.5px; padding: 2px 8px; border-radius: 999px; background: transparent; color: var(--muted); }
  .chip-btn.on { color: var(--gold); border-color: var(--gold-dim); background: #2f2a16; }
  .svc { gap: 4px; }
  .svc .chip { cursor: pointer; background: transparent; }
  .svc .chip:hover { color: var(--text); border-color: var(--gold-dim); }
  .seg { display: flex; gap: 3px; }
  .seg .on { color: var(--gold); border-color: var(--gold-dim); }
  .habit { gap: 0; }
  .kind { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; width: 54px; flex: none; color: var(--faint); }
  .kind.dungeon { color: #f39a72; }
  .kind.wild { color: var(--ok); }
  .kind.water { color: #6aa4e0; }
</style>
