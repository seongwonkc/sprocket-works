/**
 * Every user-visible proper noun lives here. Renaming the game is editing this file.
 *
 * Nothing in here may reference the 1993 original's names or trademarks — see DESIGN.md §3.
 */

export const BRAND = {
  title: 'Sprocket Works',
  /** Short form for HUD corners and tight spaces. */
  short: 'SPROCKET',
  tagline: 'Solve. Salvage. Ship it.',
  /** The antagonist. */
  rival: 'Vex Crankshaw',
  rivalShort: 'VEX',
  /** The mob that steals parts. */
  mob: 'Scrap Gremlin',
  mobPlural: 'Scrap Gremlins',
  /** The thing you throw to stun them. */
  ammo: 'bolt',
  ammoPlural: 'bolts',
  /** The building you explore. */
  place: 'the Works',
} as const;

/**
 * Palette. Deliberately narrow — 16 hues total. A tight ramp is what makes procedurally drawn
 * placeholder art read as *a style* rather than as unfinished, and it constrains PixelLab prompts later
 * so generated sprites drop in without a colour clash.
 */
export const PAL = {
  ink: '#0d0f16',
  shadow: '#1a1e2c',
  steel0: '#2b3245',
  steel1: '#3f4a63',
  steel2: '#5b6b8a',
  steel3: '#8798b5',
  bone: '#d9e0ec',
  white: '#f4f7fc',

  brass0: '#7a5320',
  brass: '#a9793f',
  brassLit: '#e0b062',
  amber: '#f2c14e',

  rust: '#a8412a',
  hot: '#e0603a',
  spark: '#5ec8e6',
  volt: '#7fe3a0',
  grape: '#6b4f9e',
} as const;

export type PalKey = keyof typeof PAL;
