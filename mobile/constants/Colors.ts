// Light/dark color tokens. Every screen reads colors through useTheme().
const light = {
  text: '#111827',
  muted: '#4b5563',
  background: '#f6f7f9',
  surface: '#ffffff',
  border: '#d9dde3',
  tint: '#1d4ed8',
  onTint: '#ffffff',
  tabIconDefault: '#9ca3af',
  tabIconSelected: '#1d4ed8',
  inputBackground: '#ffffff',
  successBg: '#dcfce7',
  successFg: '#14532d',
  infoBg: '#dbeafe',
  infoFg: '#1e3a8a',
  warnBg: '#fef3c7',
  warnFg: '#78350f',
  neutralBg: '#e5e7eb',
  neutralFg: '#374151',
  dangerBg: '#fee2e2',
  dangerFg: '#7f1d1d',
  sampleBg: '#fff7ed',
  sampleFg: '#7c2d12',
};

const dark: typeof light = {
  text: '#f3f4f6',
  muted: '#aeb4bf',
  background: '#0b0f14',
  surface: '#151b23',
  border: '#2b3440',
  tint: '#7aa7ff',
  onTint: '#0b0f14',
  tabIconDefault: '#6b7280',
  tabIconSelected: '#7aa7ff',
  inputBackground: '#10151c',
  successBg: '#123522',
  successFg: '#a7f3c4',
  infoBg: '#172a4d',
  infoFg: '#bfd6ff',
  warnBg: '#3b2a0b',
  warnFg: '#fde68a',
  neutralBg: '#262d36',
  neutralFg: '#d1d5db',
  dangerBg: '#3d1515',
  dangerFg: '#fecaca',
  sampleBg: '#3a2210',
  sampleFg: '#fed7aa',
};

export type Palette = typeof light;

export default { light, dark };
