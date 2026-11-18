/**
 * Present-mode brain silhouette + word placement.
 * BRAIN_SHAPE numbers copied from Web/client/src/utils/exitTicketBulbLayout.js
 * (700×440 design space). Do not change ellipse/stem constants.
 */

export const BRAIN_SHAPE = {
  designWidth: 700,
  designHeight: 440,
  ellipses: [
    { cx: 198.8, cy: 215, rx: 69.4, ry: 62 },
    { cx: 238.0, cy: 150, rx: 73.9, ry: 66 },
    { cx: 316.4, cy: 118, rx: 76.2, ry: 68 },
    { cx: 400.4, cy: 120, rx: 76.2, ry: 68 },
    { cx: 473.2, cy: 155, rx: 73.9, ry: 66 },
    { cx: 518.0, cy: 215, rx: 69.4, ry: 62 },
    { cx: 249.2, cy: 260, rx: 71.7, ry: 64 },
    { cx: 333.2, cy: 272, rx: 73.9, ry: 66 },
    { cx: 417.2, cy: 268, rx: 69.4, ry: 62 },
    { cx: 484.4, cy: 262, rx: 58.2, ry: 52 },
    { cx: 350.0, cy: 195, rx: 106.4, ry: 95 },
    { cx: 456.4, cy: 335, rx: 80.6, ry: 40 },
  ],
  stem: {
    topLeft: { x: 366, y: 330 },
    topRight: { x: 410, y: 330 },
    bottomRight: { x: 406, y: 420 },
    bottomLeft: { x: 370, y: 420 },
    cornerRadius: 16,
  },
  origin: { x: 350, y: 195 },
} as const;

export const BRAIN_FILL = '#0B0508';
export const WORD_CLOUD_BG = '#4A1F3D';
const GOLD = '#F2C14E';
const WHITE = '#FFFFFF';
const PINK = '#E6C8DC';
const FILLER_MAUVE = '#C9A0B8';
const FILL_THRESHOLD = 40;
export const PHONE_CLOUD_CAP = 220;
export const PHONE_FILL_TARGET = 0.85;

export type BrainMetrics = {
  w: number;
  h: number;
  scale: number;
  ox: number;
  oy: number;
  drawnW: number;
  drawnH: number;
  cx: number;
  cy: number;
  R: number;
};

export type PlacedWord = {
  key: string;
  label: string;
  display: string;
  count: number;
  real: boolean;
  cx: number;
  cy: number;
  font: number;
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  color: string;
  opacity: number;
  rotate: number;
  lines?: string[];
};

export function brainSilhouetteBounds() {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  BRAIN_SHAPE.ellipses.forEach((e) => {
    left = Math.min(left, e.cx - e.rx);
    right = Math.max(right, e.cx + e.rx);
    top = Math.min(top, e.cy - e.ry);
    bottom = Math.max(bottom, e.cy + e.ry);
  });
  const s = BRAIN_SHAPE.stem;
  left = Math.min(left, s.topLeft.x, s.bottomLeft.x);
  right = Math.max(right, s.topRight.x, s.bottomRight.x);
  top = Math.min(top, s.topLeft.y, s.topRight.y);
  bottom = Math.max(bottom, s.bottomLeft.y, s.bottomRight.y);
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

export function stemSvgPath() {
  const s = BRAIN_SHAPE.stem;
  const r = Math.min(
    s.cornerRadius,
    Math.abs(s.bottomRight.x - s.bottomLeft.x) / 2,
    Math.abs(s.bottomRight.y - s.topRight.y) / 2
  );
  return [
    `M ${s.topLeft.x} ${s.topLeft.y}`,
    `L ${s.topRight.x} ${s.topRight.y}`,
    `L ${s.bottomRight.x} ${s.bottomRight.y - r}`,
    `Q ${s.bottomRight.x} ${s.bottomRight.y} ${s.bottomRight.x - r} ${s.bottomRight.y}`,
    `L ${s.bottomLeft.x + r} ${s.bottomLeft.y}`,
    `Q ${s.bottomLeft.x} ${s.bottomLeft.y} ${s.bottomLeft.x} ${s.bottomLeft.y - r}`,
    'Z',
  ].join(' ');
}

/** Width-driven on portrait; height-first when the stage is short (landscape). */
export function fitBrainBox(availW: number, availH: number) {
  const sil = brainSilhouetteBounds();
  const aspect = sil.width / Math.max(1, sil.height);
  const stageW = Math.max(1, availW);
  const stageH = Math.max(1, availH);
  const landscape = stageH < 500 && stageH < stageW;
  if (landscape) {
    let height = stageH;
    let width = height * aspect;
    if (width > stageW) {
      width = stageW;
      height = width / aspect;
    }
    return { width, height };
  }
  let width = stageW;
  let height = width / aspect;
  if (height > stageH) {
    height = stageH;
    width = height * aspect;
  }
  return { width, height };
}

export function brainMetrics(width: number, height: number): BrainMetrics {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const sil = brainSilhouetteBounds();
  const scale = Math.min(w / sil.width, h / sil.height);
  const drawnW = sil.width * scale;
  const drawnH = sil.height * scale;
  const ox = (w - drawnW) / 2 - sil.left * scale;
  const oy = (h - drawnH) / 2 - sil.top * scale;
  const mid = BRAIN_SHAPE.ellipses[10];
  return {
    w,
    h,
    scale,
    ox,
    oy,
    drawnW,
    drawnH,
    cx: ox + BRAIN_SHAPE.origin.x * scale,
    cy: oy + BRAIN_SHAPE.origin.y * scale,
    R: mid.rx * scale,
  };
}

function pointInEllipse(
  px: number,
  py: number,
  e: { cx: number; cy: number; rx: number; ry: number }
) {
  const dx = (px - e.cx) / e.rx;
  const dy = (py - e.cy) / e.ry;
  return dx * dx + dy * dy <= 1;
}

function pointInStem(px: number, py: number, stem: typeof BRAIN_SHAPE.stem) {
  const y0 = stem.topLeft.y;
  const y1 = stem.bottomLeft.y;
  if (py < y0 || py > y1) return false;
  const t = (py - y0) / Math.max(1, y1 - y0);
  const left = stem.topLeft.x + t * (stem.bottomLeft.x - stem.topLeft.x);
  const right = stem.topRight.x + t * (stem.bottomRight.x - stem.topRight.x);
  return px >= left && px <= right;
}

export function isPointInBrain(
  x: number,
  y: number,
  width: number,
  height: number,
  metrics?: BrainMetrics
) {
  const m = metrics || brainMetrics(width, height);
  if (m.scale <= 0) return false;
  const dx = (x - m.ox) / m.scale;
  const dy = (y - m.oy) / m.scale;
  if (BRAIN_SHAPE.ellipses.some((e) => pointInEllipse(dx, dy, e))) return true;
  return pointInStem(dx, dy, BRAIN_SHAPE.stem);
}

export function isRectInBrain(
  left: number,
  top: number,
  right: number,
  bottom: number,
  width: number,
  height: number,
  metrics?: BrainMetrics
) {
  const m = metrics || brainMetrics(width, height);
  const bw = Math.max(0, right - left);
  const bh = Math.max(0, bottom - top);
  const stepX = Math.max(3, Math.min(10, bw / 8 || 3));
  const stepY = Math.max(3, Math.min(10, bh / 4 || 3));
  for (let x = left; x <= right; x += stepX) {
    if (!isPointInBrain(x, top, width, height, m)) return false;
    if (!isPointInBrain(x, (top + bottom) / 2, width, height, m)) return false;
    if (!isPointInBrain(x, bottom, width, height, m)) return false;
  }
  for (let y = top; y <= bottom; y += stepY) {
    if (!isPointInBrain(left, y, width, height, m)) return false;
    if (!isPointInBrain((left + right) / 2, y, width, height, m)) return false;
    if (!isPointInBrain(right, y, width, height, m)) return false;
  }
  return (
    isPointInBrain(right, top, width, height, m) &&
    isPointInBrain(right, bottom, width, height, m) &&
    isPointInBrain(left, bottom, width, height, m)
  );
}

export function presentFontRange(brainWidth: number) {
  const w = Math.max(1, brainWidth);
  const max = Math.round(Math.min(44, Math.max(40, w * 0.118)));
  return { min: 10, max };
}

export function hashString(value: string) {
  let h = 2166136261;
  const s = String(value || '');
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Calibrated sans-serif advance + 12% safety. Bold is slightly wider.
 * Used for both occupancy tests and SVG layout so boxes match drawing.
 */
export function estimateTextWidth(
  text: string,
  fontSize: number,
  { bold = false }: { bold?: boolean } = {}
) {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) || 0;
    if (code <= 32) {
      w += fontSize * 0.32;
      continue;
    }
    if (code >= 127) {
      w += fontSize * 0.92;
      continue;
    }
    const c = String.fromCharCode(code);
    const lower = c.toLowerCase();
    if ('il.,\'|!:;'.includes(lower)) w += fontSize * 0.3;
    else if ('jtfrI-'.includes(c) || lower === 't') w += fontSize * 0.4;
    else if ('mwMW@%'.includes(c)) w += fontSize * 0.88;
    else w += fontSize * 0.55;
  }
  // Bold system fonts on RN are wider than the old 1.16 factor, which let
  // glyphs sit past the silhouette even when the occupancy box was inside.
  const safety = bold ? 1.24 : 1.18;
  return Math.max(fontSize * 0.55, w * safety);
}

export function wrapCloudText(
  text: string,
  maxWidth: number,
  fontSize: number,
  minLines = 1
) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  if (minLines <= 1 && estimateTextWidth(raw, fontSize) <= maxWidth) return [raw];
  const words = raw.split(' ').filter(Boolean);
  if (words.length <= 1) return [raw];
  const pack = (maxLines: number) => {
    const lines: string[] = [];
    let i = 0;
    while (i < words.length && lines.length < maxLines) {
      const lastLine = lines.length === maxLines - 1;
      let take = 1;
      let line = words[i];
      while (i + take < words.length) {
        const next = `${line} ${words[i + take]}`;
        if (!lastLine && estimateTextWidth(next, fontSize) > maxWidth) break;
        line = next;
        take += 1;
      }
      lines.push(line);
      i += take;
    }
    if (i < words.length) {
      lines[lines.length - 1] = `${lines[lines.length - 1]} ${words.slice(i).join(' ')}`;
    }
    return lines;
  };
  const start = minLines > 1 ? Math.max(2, minLines) : 2;
  for (const n of [start, 3].filter((v, i, a) => a.indexOf(v) === i && v <= 3)) {
    const lines = pack(n);
    if (lines.every((line) => estimateTextWidth(line, fontSize) <= maxWidth * 1.08) && lines.length <= n) {
      return lines;
    }
  }
  return pack(3);
}

function emptyCenters(
  grid: OccupancyGrid,
  m: BrainMetrics,
  stride = 2
): [number, number][] {
  const out: [number, number][] = [];
  for (let gy = 0; gy < grid.rows; gy += stride) {
    for (let gx = 0; gx < grid.cols; gx += stride) {
      const i = gy * grid.cols + gx;
      if (grid.sil[i] && !grid.occ[i]) {
        out.push([gx * grid.cell + grid.cell / 2 - m.cx, gy * grid.cell + grid.cell / 2 - m.cy]);
      }
    }
  }
  return out;
}

type OccupancyGrid = {
  width: number;
  height: number;
  cell: number;
  cols: number;
  rows: number;
  sil: Uint8Array;
  occ: Uint8Array;
  silCount: number;
  occCount: number;
};

function createOccupancy(width: number, height: number, cell = 2): OccupancyGrid {
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));
  const sil = new Uint8Array(cols * rows);
  const m = brainMetrics(width, height);
  let silCount = 0;
  for (let gy = 0; gy < rows; gy += 1) {
    for (let gx = 0; gx < cols; gx += 1) {
      const cx = gx * cell + cell / 2;
      const cy = gy * cell + cell / 2;
      if (isPointInBrain(cx, cy, width, height, m)) {
        sil[gy * cols + gx] = 1;
        silCount += 1;
      }
    }
  }
  return {
    width,
    height,
    cell,
    cols,
    rows,
    sil,
    occ: new Uint8Array(cols * rows),
    silCount,
    occCount: 0,
  };
}

function occupancyFits(
  grid: OccupancyGrid,
  left: number,
  top: number,
  right: number,
  bottom: number,
  pad = 2
) {
  if (left < 0 || top < 0 || right > grid.width || bottom > grid.height) {
    return false;
  }
  const x0 = Math.max(0, Math.floor((left - pad) / grid.cell));
  const y0 = Math.max(0, Math.floor((top - pad) / grid.cell));
  const x1 = Math.min(grid.cols - 1, Math.floor((right + pad) / grid.cell));
  const y1 = Math.min(grid.rows - 1, Math.floor((bottom + pad) / grid.cell));
  if (x1 < x0 || y1 < y0) return false;
  for (let gy = y0; gy <= y1; gy += 1) {
    for (let gx = x0; gx <= x1; gx += 1) {
      const i = gy * grid.cols + gx;
      if (!grid.sil[i] || grid.occ[i]) return false;
    }
  }
  return true;
}

function occupancyMark(
  grid: OccupancyGrid,
  left: number,
  top: number,
  right: number,
  bottom: number,
  pad = 2
) {
  const x0 = Math.max(0, Math.floor((left - pad) / grid.cell));
  const y0 = Math.max(0, Math.floor((top - pad) / grid.cell));
  const x1 = Math.min(grid.cols - 1, Math.floor((right + pad) / grid.cell));
  const y1 = Math.min(grid.rows - 1, Math.floor((bottom + pad) / grid.cell));
  for (let gy = y0; gy <= y1; gy += 1) {
    for (let gx = x0; gx <= x1; gx += 1) {
      const i = gy * grid.cols + gx;
      if (grid.sil[i] && !grid.occ[i]) {
        grid.occ[i] = 1;
        grid.occCount += 1;
      }
    }
  }
}

export function occupancyCoverage(grid: OccupancyGrid | null | undefined) {
  if (!grid || !grid.silCount) return 0;
  return grid.occCount / grid.silCount;
}

function boxesOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
  gap: number
) {
  return !(
    a.right + gap < b.left ||
    b.right + gap < a.left ||
    a.bottom + gap < b.top ||
    b.bottom + gap < a.top
  );
}

export function colorForCloudItem(rank: number, total: number) {
  if (rank < Math.min(3, total)) return GOLD;
  if (rank % 2 === 0) return WHITE;
  return PINK;
}

function fillerDisplay(label: string) {
  const raw = String(label || '').replace(/\s+/g, ' ').trim();
  if (raw.length <= 22) return raw;
  const parts = raw.split(' ').filter(Boolean);
  if (parts.length <= 1) return raw;
  return parts.slice(Math.max(0, parts.length - 2)).join(' ');
}

function fillerTint(index: number): { color: string; opacity: number } {
  const opacity = 0.3 + (index % 4) * 0.04;
  if (index % 3 === 1) return { color: PINK, opacity };
  if (index % 3 === 2) return { color: FILLER_MAUVE, opacity };
  return { color: WHITE, opacity };
}

function fillerCountForArea(realCount: number) {
  const n = Math.max(0, realCount);
  if (n === 0) return 0;
  if (n >= FILL_THRESHOLD) return Math.min(80, Math.max(0, PHONE_CLOUD_CAP - n));
  return Math.max(0, PHONE_CLOUD_CAP - n);
}

function candidateOffsets(m: BrainMetrics, dense: boolean, rng?: () => number) {
  const offsets: [number, number][] = [
    [0, 0],
    [0, m.R * 0.55],
    [0, -m.R * 0.45],
    [m.R * 0.42, m.R * 0.12],
    [-m.R * 0.42, m.R * 0.12],
    [m.R * 0.28, m.R * 0.55],
    [-m.R * 0.28, m.R * 0.55],
    [m.R * 0.55, -m.R * 0.2],
    [-m.R * 0.55, -m.R * 0.2],
    [m.R * 0.7, m.R * 0.35],
    [-m.R * 0.7, m.R * 0.35],
    [m.R * 0.88, -m.R * 0.55],
    [-m.R * 0.88, -m.R * 0.55],
    [m.R * 0.92, m.R * 0.12],
    [-m.R * 0.92, m.R * 0.12],
    [m.R * 0.82, m.R * 0.62],
    [-m.R * 0.72, m.R * 0.62],
    [m.R * 0.12, m.R * 1.05],
  ];
  if (!dense) return offsets;
  const spin = rng ? rng() * Math.PI * 2 : 0.7;
  const maxR = Math.max(m.drawnW, m.drawnH) * 0.52;
  for (let r = 6; r <= maxR; r += 5) {
    const n = Math.min(28, Math.max(8, Math.round(r / 4)));
    for (let i = 0; i < n; i += 1) {
      const a = spin + (i / n) * Math.PI * 2;
      offsets.push([Math.cos(a) * r, Math.sin(a) * r * 0.82]);
    }
  }
  return offsets;
}

type LayoutJob = {
  key: string;
  label: string;
  display: string;
  count: number;
  real: boolean;
  maxFont: number;
  minFont: number;
  color: string;
  opacity: number;
  rotate: number;
};

export type BrainLayoutState = {
  width: number;
  height: number;
  jobs: LayoutJob[];
  placed: PlacedWord[];
  jobIndex: number;
  rng: () => number;
  m: BrainMetrics;
  fonts: { min: number; max: number };
  brainW: number;
  maxWordW: number;
  gap: number;
  realOffsets: [number, number][];
  fillerOffsets: [number, number][];
  grid: OccupancyGrid;
  extraFillerPasses: number;
  lastPassPlaced: number;
  consecutiveEmptyPasses: number;
  holesCache: [number, number][] | null;
  holesStride: number;
};

export function createBrainLayoutState(
  items: { key: string; label: string; count: number }[],
  {
    width,
    height,
    seed = 1,
    skipFiller = false,
  }: { width: number; height: number; seed?: number; skipFiller?: boolean }
): BrainLayoutState | null {
  const real = (items || [])
    .filter((i) => i.label)
    .slice()
    .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));
  if (!real.length || width < 40 || height < 40) return null;
  const rng = mulberry32(seed || 1);
  const m = brainMetrics(width, height);
  const fonts = presentFontRange(m.drawnW);
  const sil = brainSilhouetteBounds();
  const brainW = sil.width * m.scale;
  const maxWordW = brainW * 0.7;
  const gap = 2;
  const maxCount = real[0]?.count || 1;
  const minCount = real[real.length - 1]?.count || 1;
  const realOffsets = candidateOffsets(m, true, rng);
  const fillerOffsets = realOffsets;

  const jobs: LayoutJob[] = [];

  // Same mapping as Web weightFactor: (weight / 100) * maxFont, weights 70–100.
  const realJobs: LayoutJob[] = real.map((item, index) => {
    const t = maxCount === minCount ? 1 : (item.count - minCount) / (maxCount - minCount);
    const weight = 70 + t * 30;
    return {
      key: item.key,
      label: item.label,
      display: item.label,
      count: item.count,
      real: true,
      maxFont: Math.max(fonts.min, Math.round((weight / 100) * fonts.max)),
      minFont: fonts.min,
      color: colorForCloudItem(index, real.length),
      opacity: 1,
      rotate: 0,
    };
  });
  const lineCap = brainW * 0.46;
  const wrapping = realJobs.filter((j) => estimateTextWidth(j.display, 14) > lineCap);
  const rest = realJobs.filter((j) => estimateTextWidth(j.display, 14) <= lineCap);
  if (rest.length && wrapping.length) {
    jobs.push(rest[0], ...wrapping, ...rest.slice(1));
  } else {
    jobs.push(...realJobs);
  }

  if (!skipFiller) {
    const copies = fillerCountForArea(real.length);
    for (let i = 0; i < copies; i += 1) {
      const item = real[i % real.length];
      const weight = 22 + (i % 11);
      const tint = fillerTint(i);
      jobs.push({
        key: `${item.key}-fill-${i}`,
        label: item.label,
        display: fillerDisplay(item.label),
        count: item.count,
        real: false,
        maxFont: Math.max(fonts.min, Math.round((weight / 100) * fonts.max)),
        minFont: fonts.min,
        color: tint.color,
        opacity: tint.opacity,
        rotate: rng() < 0.18 ? 90 : 0,
      });
    }
  }

  return {
    width,
    height,
    jobs,
    placed: [],
    jobIndex: 0,
    rng,
    m,
    fonts,
    brainW,
    maxWordW,
    gap,
    realOffsets,
    fillerOffsets,
    grid: createOccupancy(width, height),
    extraFillerPasses: 0,
    lastPassPlaced: 0,
    consecutiveEmptyPasses: 0,
    holesCache: null,
    holesStride: 0,
  };
}

function lineHeightFor(font: number) {
  return font * 1.16;
}

function boxForLines(lines: string[], font: number, rotate: number, bold: boolean) {
  const tw = Math.max(...lines.map((line) => estimateTextWidth(line, font, { bold })), font);
  const th = lines.length * lineHeightFor(font);
  const rotated = rotate === 90;
  return {
    tw,
    th,
    boxW: rotated ? th : tw,
    boxH: rotated ? tw : th,
    lines,
  };
}

function tryPlaceAt(
  state: BrainLayoutState,
  job: LayoutJob,
  font: number,
  lines: string[],
  offsets: [number, number][],
  start: number,
  padOverride?: number
): PlacedWord | null {
  const geom = boxForLines(lines, font, job.rotate, job.real);
  const capW = job.real ? state.maxWordW : state.brainW * 0.92;
  if (job.rotate !== 90 && lines.length === 1 && geom.tw > capW + 2) return null;
  if (job.real && geom.boxW > state.maxWordW + 2) return null;
  if (job.real && geom.boxH > state.m.drawnH * 0.34) return null;
  if (job.rotate === 90 && geom.tw > state.brainW * 0.62) return null;
  const pad = padOverride ?? (job.real ? 2 : 1);
  const maxAttempts = job.real
    ? offsets.length
    : font <= 12
      ? offsets.length
      : Math.min(offsets.length, 400);
  for (let k = 0; k < maxAttempts; k += 1) {
    const o = offsets[(start + k) % offsets.length];
    const cx = state.m.cx + o[0];
    const cy = state.m.cy + o[1];
    const left = cx - geom.boxW / 2;
    const right = cx + geom.boxW / 2;
    const top = cy - geom.boxH / 2;
    const bottom = cy + geom.boxH / 2;
    if (!occupancyFits(state.grid, left, top, right, bottom, pad)) continue;
    if (!isRectInBrain(left, top, right, bottom, state.width, state.height, state.m)) continue;
    occupancyMark(state.grid, left, top, right, bottom, pad);
    state.holesCache = null;
    return {
      key: job.key,
      label: job.label,
      display: lines.join('\n'),
      count: job.count,
      real: job.real,
      cx,
      cy,
      font,
      width: geom.boxW,
      height: geom.boxH,
      left,
      right,
      top,
      bottom,
      color: job.color,
      opacity: job.opacity,
      rotate: job.rotate,
      lines,
    };
  }
  return null;
}

function tryPlaceLoose(
  state: BrainLayoutState,
  job: LayoutJob,
  font: number,
  lines: string[]
): PlacedWord | null {
  const geom = boxForLines(lines, font, job.rotate, job.real);
  if (geom.boxW < 2 || geom.boxH < 2) return null;
  const step = 2;
  const gap = 1;
  for (let y = geom.boxH / 2; y <= state.height - geom.boxH / 2; y += step) {
    for (let x = geom.boxW / 2; x <= state.width - geom.boxW / 2; x += step) {
      const left = x - geom.boxW / 2;
      const right = x + geom.boxW / 2;
      const top = y - geom.boxH / 2;
      const bottom = y + geom.boxH / 2;
      if (!isRectInBrain(left, top, right, bottom, state.width, state.height, state.m)) continue;
      const box = { left, right, top, bottom };
      if (state.placed.some((p) => boxesOverlap(p, box, gap))) continue;
      occupancyMark(state.grid, left, top, right, bottom, 1);
      state.holesCache = null;
      return {
        key: job.key,
        label: job.label,
        display: lines.join('\n'),
        count: job.count,
        real: job.real,
        cx: x,
        cy: y,
        font,
        width: geom.boxW,
        height: geom.boxH,
        left,
        right,
        top,
        bottom,
        color: job.color,
        opacity: job.opacity,
        rotate: job.rotate,
        lines,
      };
    }
  }
  return null;
}

function holesFor(state: BrainLayoutState, stride: number) {
  if (state.holesCache && state.holesStride === stride) return state.holesCache;
  state.holesStride = stride;
  state.holesCache = emptyCenters(state.grid, state.m, stride);
  return state.holesCache;
}

function placeOneJob(state: BrainLayoutState, job: LayoutJob): PlacedWord | null {
  const spiral = job.real ? state.realOffsets : state.fillerOffsets;
  const start = job.real ? 0 : Math.floor(state.rng() * Math.max(1, spiral.length));
  const minFont = Math.max(state.fonts.min, job.minFont);
  const maxFont = Math.max(minFont, job.maxFont);
  const lineCap = Math.min(state.maxWordW, state.brainW * 0.46);

  if (job.real) {
    for (let font = maxFont; font >= minFont; font -= 1) {
      const fitted = tryPlaceAt(state, job, font, [job.display], spiral, start);
      if (fitted) return fitted;
    }
    const holes = holesFor(state, 1);
    const wrapFrom = Math.max(minFont, Math.min(maxFont, Math.round(state.fonts.max * 0.5)));
    for (const minLines of [2, 3]) {
      for (let font = wrapFrom; font >= minFont; font -= 1) {
        const wrapped = wrapCloudText(job.display, lineCap, font, minLines);
        const lines = wrapped.length ? wrapped : [job.display];
        const fitted =
          tryPlaceAt(state, job, font, lines, spiral, start) ||
          tryPlaceAt(state, job, font, lines, holes, 0);
        if (fitted) return fitted;
      }
    }
    const fineHoles = emptyCenters(state.grid, state.m, 1);
    for (const cap of [lineCap, lineCap * 0.72, lineCap * 0.55, state.brainW * 0.34]) {
      const last = wrapCloudText(job.display, cap, minFont, 3);
      const lines = last.length ? last : [job.display];
      const fitted =
        tryPlaceAt(state, job, minFont, lines, fineHoles, 0, 2) ||
        tryPlaceAt(state, job, minFont, lines, fineHoles, 0, 1);
      if (fitted) return fitted;
    }
    let clipped = job.display;
    const clipCap = state.brainW * 0.34;
    while (
      clipped.length > 4 &&
      estimateTextWidth(clipped, minFont, { bold: true }) > clipCap
    ) {
      clipped = clipped.slice(0, clipped.length - 2).trimEnd();
    }
    if (clipped && clipped !== job.display) {
      const shown = `${clipped}…`;
      const fitted =
        tryPlaceAt(state, { ...job, display: shown }, minFont, [shown], fineHoles, 0, 1) ||
        tryPlaceAt(state, { ...job, display: shown }, minFont, wrapCloudText(shown, clipCap, minFont, 2), fineHoles, 0, 1);
      if (fitted) return fitted;
    }
    const looseLines = wrapCloudText(job.display, clipCap * 0.5, minFont, 3);
    const stacked = job.display.split(/\s+/).filter(Boolean);
    const rotated = { ...job, rotate: 90 };
    return (
      tryPlaceLoose(state, job, minFont, [job.display]) ||
      tryPlaceLoose(state, job, minFont, looseLines.length ? looseLines : [job.display]) ||
      (stacked.length > 1 ? tryPlaceLoose(state, job, minFont, stacked) : null) ||
      tryPlaceLoose(state, rotated, minFont, [job.display]) ||
      (stacked.length > 1 ? tryPlaceLoose(state, rotated, minFont, stacked) : null)
    );
  }

  for (let font = maxFont; font >= minFont; font -= 1) {
    const text = job.display;
    const maxLine = job.rotate === 90 ? state.brainW * 0.42 : state.brainW * 0.34;
    const tooLong = estimateTextWidth(text, font) > maxLine;
    const useJob = job.rotate === 90 && tooLong ? { ...job, rotate: 0 } : job;
    const lines =
      useJob.rotate === 90 || estimateTextWidth(text, font) <= maxLine
        ? [text]
        : wrapCloudText(text, maxLine, font, 2);
    const holes = holesFor(state, font <= 10 ? 1 : 2);
    const holeStart = font <= 10 ? 0 : Math.floor(state.rng() * Math.max(1, holes.length || 1));
    const fitted = tryPlaceAt(state, useJob, font, lines.length ? lines : [text], holes, holeStart);
    if (fitted) return fitted;
  }
  return null;
}

function appendExtraFiller(state: BrainLayoutState, count: number) {
  const reals = state.jobs.filter((j) => j.real);
  if (!reals.length) return;
  const startKey = state.jobs.length;
  for (let i = 0; i < count; i += 1) {
    const item = reals[i % reals.length];
    const tint = fillerTint(startKey + i);
    state.jobs.push({
      key: `${item.key}-fill-x-${startKey + i}`,
      label: item.label,
      display: fillerDisplay(item.label),
      count: item.count,
      real: false,
      maxFont:
        state.extraFillerPasses >= 2
          ? state.fonts.min
          : Math.max(state.fonts.min, Math.round(((16 + ((startKey + i) % 10)) / 100) * state.fonts.max)),
      minFont: state.fonts.min,
      color: tint.color,
      opacity: tint.opacity,
      rotate: state.rng() < 0.18 ? 90 : 0,
    });
  }
}

export function placeAllRealJobs(state: BrainLayoutState) {
  const skipped: LayoutJob[] = [];
  while (state.jobIndex < state.jobs.length && state.jobs[state.jobIndex].real) {
    const job = state.jobs[state.jobIndex];
    state.jobIndex += 1;
    const fitted = placeOneJob(state, job);
    if (fitted) state.placed.push(fitted);
    else skipped.push({ ...job, maxFont: state.fonts.min });
  }
  skipped.forEach((job) => {
    const fitted = placeOneJob(state, job);
    if (fitted) state.placed.push(fitted);
  });
}

export function placeBrainLayoutSlice(state: BrainLayoutState, limit = 12, budgetMs = 9) {
  const t0 = Date.now();
  let remaining = Math.max(1, limit);
  while (remaining > 0 && Date.now() - t0 < budgetMs) {
    if (state.jobIndex >= state.jobs.length) {
      const covered = occupancyCoverage(state.grid);
      const placedNow = state.placed.length;
      if (covered >= PHONE_FILL_TARGET || placedNow >= PHONE_CLOUD_CAP) return true;
      if (state.extraFillerPasses >= 20) return true;
      if (state.consecutiveEmptyPasses >= 3 && state.extraFillerPasses >= 2) return true;
      const room = PHONE_CLOUD_CAP - placedNow;
      if (room <= 0) return true;
      if (placedNow === state.lastPassPlaced && state.extraFillerPasses > 0) {
        state.consecutiveEmptyPasses += 1;
      } else {
        state.consecutiveEmptyPasses = 0;
      }
      state.lastPassPlaced = placedNow;
      state.extraFillerPasses += 1;
      appendExtraFiller(state, Math.min(40, room));
      if (state.jobIndex >= state.jobs.length) return true;
    }
    const job = state.jobs[state.jobIndex];
    state.jobIndex += 1;
    remaining -= 1;
    if (state.placed.length >= PHONE_CLOUD_CAP && !job.real) continue;
    const fitted = placeOneJob(state, job);
    if (fitted) state.placed.push(fitted);
  }
  return (
    state.jobIndex >= state.jobs.length &&
    (occupancyCoverage(state.grid) >= PHONE_FILL_TARGET ||
      state.placed.length >= PHONE_CLOUD_CAP ||
      state.extraFillerPasses >= 20 ||
      (state.consecutiveEmptyPasses >= 3 && state.extraFillerPasses >= 2))
  );
}

export function layoutBrainWords(
  items: { key: string; label: string; count: number }[],
  opts: { width: number; height: number; seed?: number; skipFiller?: boolean }
): PlacedWord[] {
  const state = createBrainLayoutState(items, opts);
  if (!state) return [];
  let guard = 0;
  while (!placeBrainLayoutSlice(state, 50, 50) && guard < 400) guard += 1;
  return state.placed;
}

export function layoutBrainCloud(
  items: { key: string; label: string; count: number }[],
  opts: { width: number; height: number; seed?: number; skipFiller?: boolean }
) {
  const state = createBrainLayoutState(items, opts);
  if (!state) return { placed: [] as PlacedWord[], coverage: 0 };
  let guard = 0;
  while (!placeBrainLayoutSlice(state, 50, 50) && guard < 400) guard += 1;
  return {
    placed: state.placed,
    coverage: occupancyCoverage(state.grid),
  };
}

export function layoutPlainRealWords(
  items: { key: string; label: string; count: number }[],
  opts: { width: number; height: number; seed?: number }
): PlacedWord[] {
  return layoutBrainWords(items, { ...opts, skipFiller: true });
}

export function cloudA11ySummary(items: { label: string; count: number }[]) {
  const top = (items || []).slice(0, 8);
  if (!top.length) return 'Word cloud: no responses yet';
  return `Word cloud: ${top.map((i) => `${i.label} ${i.count}`).join(', ')}`;
}
