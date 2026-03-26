import { TextStyle } from 'react-native';

// ============================================
// QUESTCAST - Dark Fantasy Theme
// ============================================

export const Colors = {
  // Primary palette
  background: '#0D0A1A',
  backgroundLight: '#1A1530',
  backgroundCard: '#221D3A',
  surface: '#2A2445',
  surfaceLight: '#352F52',

  // Gold accents
  gold: '#D4A843',
  goldLight: '#E8C96A',
  goldDark: '#B8922A',
  goldMuted: '#9A7B3A',

  // Text
  textPrimary: '#F0E6D3',
  textSecondary: '#A89DB5',
  textMuted: '#6B6080',
  textGold: '#D4A843',

  // Health / Danger
  healthGreen: '#4CAF50',
  healthYellow: '#FFC107',
  healthRed: '#E53935',
  danger: '#E53935',
  dangerLight: '#FF6B6B',

  // Status
  success: '#4CAF50',
  warning: '#FFC107',
  info: '#5C6BC0',
  error: '#E53935',

  // Accent
  purple: '#7C4DFF',
  purpleLight: '#B47CFF',
  purpleDark: '#5C35CC',
  blue: '#42A5F5',
  cyan: '#26C6DA',

  // UI elements
  border: '#3A3455',
  borderLight: '#4A4465',
  divider: '#2A2445',
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.4)',

  // Mic button
  micIdle: '#2A2445',
  micRecording: '#E53935',
  micProcessing: '#7C4DFF',

  // Character classes
  warrior: '#E53935',
  mage: '#7C4DFF',
  rogue: '#4CAF50',
  ranger: '#42A5F5',

  // Misc
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  round: 9999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  xxxl: 34,
  title: 42,
} as const;

export const FontWeight: Record<string, TextStyle['fontWeight']> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
};

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 6,
  }),
} as const;

export const HitSlop = {
  default: { top: 10, bottom: 10, left: 10, right: 10 },
  large: { top: 16, bottom: 16, left: 16, right: 16 },
} as const;

export const CLASS_COLORS: Record<string, string> = {
  warrior: Colors.warrior,
  mage: Colors.mage,
  rogue: Colors.rogue,
  ranger: Colors.ranger,
};

export const CLASS_ICONS: Record<string, string> = {
  warrior: '⚔️',
  mage: '🔮',
  rogue: '🗡️',
  ranger: '🏹',
};

export const CLASS_DESCRIPTIONS: Record<string, string> = {
  warrior: 'A mighty fighter wielding sword and shield. High health, strong melee attacks.',
  mage: 'A wielder of arcane magic. Powerful spells, but fragile in close combat.',
  rogue: 'A stealthy shadow striker. Quick, cunning, and deadly from behind.',
  ranger: 'A master of bow and nature. Versatile at range, with tracking skills.',
};
