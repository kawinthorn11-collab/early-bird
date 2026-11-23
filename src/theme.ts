import type { CSSProperties } from 'react';

export type Land = 1 | 2 | 3 | 4;

type LandTheme = { name: string; from: string; to: string; accent: string; soft: string; ink: string };

export const LAND_THEME: Record<Land, LandTheme> = {
  1: { name: 'Forest', from: '#00a95c', to: '#00643a', accent: '#00894b', soft: '#d3f0df', ink: '#003d22' },
  2: { name: 'Mountains', from: '#ff6c2f', to: '#b23c0c', accent: '#d4521a', soft: '#ffe1d1', ink: '#6b2205' },
  3: { name: 'River', from: '#2a8fd6', to: '#1d4fa0', accent: '#1f6fb8', soft: '#d8eafa', ink: '#0d3460' },
  4: { name: 'Arena', from: '#ff4d94', to: '#a3124f', accent: '#d42a6f', soft: '#ffdcea', ink: '#6b0a33' },
};

export const tint = (color: string) => ({ '--k': color }) as CSSProperties;
