/**
 * 5x7 bitmap font, drawn as rectangles.
 *
 * A real pixel font rather than `fillText`: at a 320x180 backbuffer, canvas text antialiases into mush
 * and then gets nearest-neighbour scaled 6x, which looks like a smear. Rectangles stay crisp at any scale.
 *
 * Each glyph is 7 rows encoded base32, bit 4 = leftmost column.
 */

const B32 = '0123456789ABCDEFGHIJKLMNOPQRSTUV';

const GLYPHS: Record<string, string> = {
  A: 'EHHVHHH', B: 'UHHUHHU', C: 'EHGGGHE', D: 'UHHHHHU', E: 'VGGUGGV',
  F: 'VGGUGGG', G: 'EHGNHHF', H: 'HHHVHHH', I: 'E44444E', J: '72222IC',
  K: 'HIKOKIH', L: 'GGGGGGV', M: 'HRLLHHH', N: 'HPPLJJH', O: 'EHHHHHE',
  P: 'UHHUGGG', Q: 'EHHHLID', R: 'UHHUKIH', S: 'FGGE11U', T: 'V444444',
  U: 'HHHHHHE', V: 'HHHHHA4', W: 'HHHLLRH', X: 'HHA4AHH', Y: 'HHA4444',
  Z: 'V1248GV',
  '0': 'EHJLPHE', '1': '4C4444E', '2': 'EH1248V', '3': 'V2421HE', '4': '26AIV22',
  '5': 'VGU11HE', '6': '68GUHHE', '7': 'V124888', '8': 'EHHEHHE', '9': 'EHHF12C',
  ' ': '0000000', '.': '0000004', ',': '0000048', '!': '4444404', '?': 'EH12404',
  ':': '0440440', '-': '000E000', '+': '004E400', '/': '11248GG', '(': '2488842',
  ')': '8422248', '%': 'PQ248BJ', '=': '00V0V00', "'": '4400000', '>': '8421248',
  '<': '248G842', '#': 'AAVAVAA', '*': '4LE4EL4', '°': 'CIC0000', '&': 'CIK8LID',
};

const UNKNOWN = 'VHHHHHV';

export const GLYPH_W = 5;
export const GLYPH_H = 7;
/** Advance per character, including the 1px gap. */
export const CHAR_ADV = 6;
/** Baseline-to-baseline for wrapped text. */
export const LINE_H = 9;

export function textWidth(s: string, scale = 1): number {
  return s.length === 0 ? 0 : (s.length * CHAR_ADV - 1) * scale;
}

/**
 * Draw `s` with its top-left at (x, y). Coordinates are rounded so glyphs never straddle a pixel.
 * Text is uppercased — the font has no lowercase, and silently dropping it would be worse.
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color: string,
  scale = 1,
): void {
  ctx.fillStyle = color;
  const px = Math.round(x);
  const py = Math.round(y);
  const up = s.toUpperCase();

  for (let i = 0; i < up.length; i++) {
    const ch = up[i] as string;
    if (ch === ' ') continue;
    const rows = GLYPHS[ch] ?? UNKNOWN;
    const gx = px + i * CHAR_ADV * scale;
    for (let r = 0; r < GLYPH_H; r++) {
      const bits = B32.indexOf(rows[r] as string);
      if (bits <= 0) continue;
      // Coalesce horizontal runs into one fillRect — roughly halves the draw calls for text-heavy screens.
      let c = 0;
      while (c < GLYPH_W) {
        if (bits & (1 << (4 - c))) {
          let run = 1;
          while (c + run < GLYPH_W && bits & (1 << (4 - (c + run)))) run++;
          ctx.fillRect(gx + c * scale, py + r * scale, run * scale, scale);
          c += run;
        } else {
          c++;
        }
      }
    }
  }
}

/** Draw with a 1px drop shadow. Used wherever text sits over busy art. */
export function drawTextShadow(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color: string,
  shadow = '#000000',
  scale = 1,
): void {
  drawText(ctx, s, x + scale, y + scale, shadow, scale);
  drawText(ctx, s, x, y, color, scale);
}

export function drawTextCentered(
  ctx: CanvasRenderingContext2D,
  s: string,
  cx: number,
  y: number,
  color: string,
  scale = 1,
): void {
  drawText(ctx, s, cx - textWidth(s, scale) / 2, y, color, scale);
}

/** Greedy word wrap to `maxW` logical px. Words longer than a line are hard-split rather than overflowing. */
export function wrapText(s: string, maxW: number, scale = 1): string[] {
  const perLine = Math.max(1, Math.floor((maxW / scale + 1) / CHAR_ADV));
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      let w = word;
      while (w.length > perLine) {
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, perLine));
        w = w.slice(perLine);
      }
      const cand = line ? `${line} ${w}` : w;
      if (cand.length > perLine) {
        out.push(line);
        line = w;
      } else {
        line = cand;
      }
    }
    out.push(line);
  }
  return out;
}
