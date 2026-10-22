<script lang="ts">
  let { name, size = 18 }: { name: string; size?: number } = $props();
  // 24x24 stroke icons.
  const paths: Record<string, string> = {
    map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14',
    skull: 'M12 3a8 8 0 0 0-8 8c0 2.8 1.4 4.5 3 5.5V20h10v-3.5c1.6-1 3-2.7 3-5.5a8 8 0 0 0-8-8ZM9 12.5h.01M15 12.5h.01M10 20v-2m4 2v-2',
    book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 16a2 2 0 0 1 2-2h13v2H6M8 7h7M8 11h5',
    person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
    scroll: 'M7 3h11a2 2 0 0 1 2 2v2h-4M7 3a2 2 0 0 0-2 2v12a2 2 0 0 1-2 2h11a2 2 0 0 0 2-2V5a2 2 0 0 1 2-2M9 8h4m-4 4h4',
    archive: 'M3 5h18v4H3zm2 4v10h14V9M10 13h4',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1c.7.6 1.4 1 2.2 1.3l.4 2.4h4l.4-2.4c.8-.3 1.5-.7 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
    search: 'm20 20-4.5-4.5M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
    layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
    plus: 'M12 5v14M5 12h14',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    eyeoff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
    pin: 'M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
    close: 'M6 6l12 12M18 6 6 18',
    town: 'M3 21h18M5 21V10l5-4 5 4v11M15 21v-7h4v7M9 21v-4h2v4',
    refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
    up: 'm6 15 6-6 6 6',
    down: 'm6 9 6 6 6-6',
    panel: 'M3 4h18v16H3zM15 4v16',
    dock: 'M3 4h18v16H3zM3 14h18',
    back: 'M15 18 9 12l6-6',
    note: 'M5 3h10l4 4v14H5V3Zm10 0v4h4M8 12h8M8 16h6',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    download: 'M12 4v11m0 0 4-4m-4 4-4-4M5 20h14',
    upload: 'M12 20V9m0 0 4 4m-4-4-4 4M5 4h14',
    check: 'm5 12 5 5L20 7',
    shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z',
    crosshair: 'M12 2v4m0 12v4M2 12h4m12 0h4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  };
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d={paths[name] ?? ''} />
</svg>
