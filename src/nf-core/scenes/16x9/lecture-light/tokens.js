// lecture-light tokens — single source of truth for all components in this theme.

function getTokens() {
  return {
    // Colors
    title: '#1a1a2e',
    body: '#333333',
    bodyDim: '#888888',
    accent: '#3b82f6',
    accentWarm: '#f59e0b',
    bg: '#fafafa',
    bgCard: '#ffffff',
    border: '#e5e7eb',
    shadow: '0 2px 8px rgba(0,0,0,0.06)',

    // Code-specific
    codeBg: '#1e1e2e',
    codeText: '#a6e3a1',
    codeComment: '#6c7086',
    codeKeyword: '#cba6f7',
    codeString: '#f9e2af',

    // Data-specific
    dataPrimary: '#3b82f6',
    dataSecondary: '#f59e0b',
    dataTertiary: '#10b981',
    axisColor: '#888888',
    gridColor: '#e5e7eb',

    // Typography sizes
    titleSize: '52px',
    subtitleSize: '28px',
    bodySize: '24px',
    labelSize: '18px',
    codeSize: '20px',
    brandSize: '18px',

    // Typography weights
    titleWeight: '700',
    subtitleWeight: '400',
    bodyWeight: '400',
    labelWeight: '500',
    brandWeight: '300',

    // Font stacks
    fontCn: '"PingFang SC", "Noto Sans SC", sans-serif',
    fontEn: '"Inter", "SF Pro Display", "Helvetica Neue", sans-serif',
    fontCode: '"SF Mono", "Fira Code", "Consolas", monospace',

    // Layout (1920x1080 grid)
    padding: 80,
    gap: 20,
    contentWidth: 1760,

    titleY: 80,
    titleHeight: 120,

    contentY: 220,
    contentHeight: 760,

    progressY: 1000,
    progressHeight: 4,

    brandY: 1020,
    brandHeight: 60,

    // Border radius
    radius: '12px',
    radiusSmall: '6px',
    radiusLarge: '16px',

    // Brand
    brandLetterSpacing: '4px',
  };
}
