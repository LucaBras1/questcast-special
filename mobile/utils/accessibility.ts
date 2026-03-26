// ============================================
// QUESTCAST - Accessibility Utilities
// ============================================

import { AccessibilityRole } from 'react-native';

// Minimum touch target size per WCAG / Material Design guidelines
export const MIN_TOUCH_TARGET = 48;

// WCAG AA contrast ratios
export const CONTRAST_RATIO_AA_NORMAL = 4.5;
export const CONTRAST_RATIO_AA_LARGE = 3.0;

/**
 * Parse a hex color string to RGB components.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace('#', '');
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return { r, g, b };
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.substring(0, 2), 16);
    const g = parseInt(cleaned.substring(2, 4), 16);
    const b = parseInt(cleaned.substring(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

/**
 * Calculate relative luminance per WCAG 2.1.
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two hex colors.
 * Returns a number >= 1. Higher is better contrast.
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  if (!c1 || !c2) return 0;

  const l1 = relativeLuminance(c1.r, c1.g, c1.b);
  const l2 = relativeLuminance(c2.r, c2.g, c2.b);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if two colors meet WCAG AA for normal text (4.5:1).
 */
export function meetsContrastAA(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= CONTRAST_RATIO_AA_NORMAL;
}

/**
 * Check if two colors meet WCAG AA for large text (3:1).
 */
export function meetsContrastAALarge(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= CONTRAST_RATIO_AA_LARGE;
}

/**
 * Common accessibility labels for the app.
 */
export const A11yLabels = {
  // Navigation
  goBack: 'Go back',
  openSettings: 'Open settings',
  closeDialog: 'Close dialog',

  // Game controls
  startRecording: 'Start voice recording',
  stopRecording: 'Stop recording and send',
  switchToText: 'Switch to text input',
  switchToVoice: 'Switch to voice input',
  sendMessage: 'Send message',
  rollDice: 'Roll the dice',
  saveAndQuit: 'Save and quit adventure',
  retryAction: 'Retry last action',

  // Tutorial
  skipTutorial: 'Skip tutorial',
  nextStep: 'Continue to next step',
  gotIt: 'Got it, dismiss instruction',

  // Game info
  healthBar: (current: number, max: number) => `Health: ${current} out of ${max}`,
  sessionTimer: (time: string) => `Session time: ${time}`,
  goldAmount: (gold: number) => `Gold: ${gold}`,
  inventoryCount: (count: number) => `${count} items in inventory`,
  characterLevel: (level: number) => `Level ${level}`,
} as const;

/**
 * Common accessibility hints for non-obvious actions.
 */
export const A11yHints = {
  micButton: 'Double tap to start recording your voice command',
  micButtonRecording: 'Double tap to stop recording and send your command',
  diceRoll: 'Double tap to roll the dice for your action',
  expandPanel: 'Double tap to expand character information panel',
  sessionCard: 'Double tap to continue this adventure',
  sceneImage: 'Double tap to view full screen image',
  retryButton: 'Double tap to retry the failed action',
  tutorialSkip: 'Double tap to skip the tutorial and go to character creation',
} as const;

/**
 * Get proper accessibility role for an element type.
 */
export const A11yRoles: Record<string, AccessibilityRole> = {
  button: 'button',
  link: 'link',
  heading: 'header',
  image: 'image',
  text: 'text',
  search: 'search',
  switch: 'switch',
  slider: 'adjustable',
  tab: 'tab',
  timer: 'timer',
  progressbar: 'progressbar',
} as const;
