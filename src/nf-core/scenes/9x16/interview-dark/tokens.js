// interview-dark tokens — single source of truth for all components in this theme.
// Components import this and use getTokens(). Never hardcode values.

function getTokens() {
  return {
    // Colors
    title: '#e8c47a',
    body: '#f4efe8',
    bodyDim: 'rgba(244,239,232,0.6)',
    accent: '#e8c47a',
    bg: '#111111',
    bgCard: 'rgba(255,255,255,0.05)',
    border: 'rgba(232,196,122,0.2)',

    // Subtitle-specific
    cnSub: '#e8c47a',
    enSub: 'rgba(244,239,232,0.55)',

    // Typography sizes
    titleSize: '60px',
    subtitleSize: '28px',
    bodySize: '28px',
    labelSize: '20px',
    cnSubSize: '42px',
    enSubSize: '22px',
    brandSize: '32px',
    tagSize: '22px',

    // Typography weights
    titleWeight: '700',
    subtitleWeight: '600',
    bodyWeight: '400',
    labelWeight: '500',
    cnSubWeight: '700',

    // Font stacks
    fontCn: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
    fontEn: '"SF Pro Display", "Inter", "Helvetica Neue", sans-serif',

    // Layout (1080x1920 grid)
    padding: 80,
    gap: 16,
    contentWidth: 920,

    headerY: 80,
    headerHeight: 180,

    videoX: 80,
    videoY: 276,
    videoWidth: 920,
    videoHeight: 538,

    subY: 840,
    subHeight: 540,

    metaY: 1400,
    metaHeight: 280,

    progressY: 1700,
    progressHeight: 6,

    brandY: 1750,
    brandHeight: 170,

    // videoOverlay percentages (for timeline JSON)
    videoOverlay: {
      x: '7.4074%',
      y: '14.3750%',
      w: '85.1852%',
      h: '28.0208%',
    },

    // Border radius
    radius: '12px',
    radiusSmall: '6px',

    // Brand
    brandLetterSpacing: '8px',
    brandWeight: '300',
  };
}
