<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import { ATLAS, type GuideRecord } from '../lib/db/model';
  import PlaneBadge from './PlaneBadge.svelte';

  const guides = $derived(
    app.visibleRecords.filter((r): r is GuideRecord => r.kind === 'guide').sort((a, b) => a.title.localeCompare(b.title)),
  );
  let openId = $state<string | null>(null);
  const current = $derived(guides.find((g) => g.id === openId) ?? guides[0] ?? null);

  type Part = { text: string } | { link: string };
  function parse(body: string): Part[] {
    const out: Part[] = [];
    const re = /\[\[([^\]]+)\]\]/g;
    let last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      if (m.index > last) out.push({ text: body.slice(last, m.index) });
      out.push({ link: m[1] });
      last = m.index + m[0].length;
    }
    if (last < body.length) out.push({ text: body.slice(last) });
    return out;
  }
  function follow(name: string) {
    const g = app.game;
    if (!g) return;
    const l = g.maps.locations.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (l) app.goToLocation(l);
    else app.toast(`No place called “${name}”.`, 'warn');
  }
</script>

<div class="page">
  <aside>
    <div class="row">
      <h2>Guides</h2>
      <span class="spacer"></span>
      <button class="small primary" onclick={() => (app.composer = { kind: 'guide', anchor: null, plane: ATLAS })}>New</button>
    </div>
    {#each guides as gd (gd.id)}
      <button class="item" class:active={current?.id === gd.id} onclick={() => (openId = gd.id)}>
        <span>{gd.title}</span><PlaneBadge plane={gd.plane} />
      </button>
    {:else}
      <p class="empty">Guides are your own reference pages: quest notes, faction notes, how-tos. Link places with [[Place Name]].</p>
    {/each}
  </aside>
  <article>
    {#if current}
      <div class="row">
        <h1>{current.title}</h1>
        <span class="spacer"></span>
        <PlaneBadge plane={current.plane} />
        <button class="small" onclick={() => (app.composer = { kind: 'guide', anchor: null, recordId: current.id })}>Edit</button>
      </div>
      {#if current.tags.length}<div class="row wrap">{#each current.tags as t}<span class="chip">#{t}</span>{/each}</div>{/if}
      <div class="body">
        {#each parse(current.body) as p}{#if 'link' in p}<button class="link" onclick={() => follow(p.link)}>{p.link}</button>{:else}{p.text}{/if}{/each}
      </div>
    {/if}
  </article>
</div>

<style>
  .page { position: absolute; inset: 0; display: grid; grid-template-columns: 280px 1fr; }
  aside { border-right: 1px solid var(--line-soft); padding: 16px; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
  h2 { color: var(--gold); font-size: 20px; }
  h1 { color: var(--gold); font-size: 24px; }
  .item { display: flex; justify-content: space-between; gap: 6px; text-align: left; background: transparent; border-color: transparent; }
  .item.active { background: var(--panel-3); border-color: var(--line); }
  article { padding: 20px 28px; overflow: auto; display: flex; flex-direction: column; gap: 10px; max-width: 860px; }
  .body { white-space: pre-wrap; line-height: 1.6; font-size: 15px; }
  .link { background: none; border: 0; padding: 0; color: var(--gold); text-decoration: underline dotted; font-size: inherit; }
  @media (max-width: 800px) { .page { grid-template-columns: 1fr; } aside { border-right: 0; max-height: 40vh; } }
</style>
