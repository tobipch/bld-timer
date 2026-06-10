/**
 * Letter schemes map sticker names (e.g. corner "RDF", edge "LU") to letters.
 * Speffz is the default; users can override any sticker in settings.
 */

export interface LetterScheme {
  corners: Record<string, string>;
  edges: Record<string, string>;
}

export const SPEFFZ_CORNERS: Record<string, string> = {
  UBL: "A",
  UBR: "B",
  UFR: "C",
  UFL: "D",
  LUB: "E",
  LUF: "F",
  LDF: "G",
  LDB: "H",
  FUL: "I",
  FUR: "J",
  FDR: "K",
  FDL: "L",
  RUF: "M",
  RUB: "N",
  RDB: "O",
  RDF: "P",
  BUR: "Q",
  BUL: "R",
  BDL: "S",
  BDR: "T",
  DFL: "U",
  DFR: "V",
  DBR: "W",
  DBL: "X",
};

export const SPEFFZ_EDGES: Record<string, string> = {
  UB: "A",
  UR: "B",
  UF: "C",
  UL: "D",
  LU: "E",
  LF: "F",
  LD: "G",
  LB: "H",
  FU: "I",
  FR: "J",
  FD: "K",
  FL: "L",
  RU: "M",
  RB: "N",
  RD: "O",
  RF: "P",
  BU: "Q",
  BL: "R",
  BD: "S",
  BR: "T",
  DF: "U",
  DR: "V",
  DB: "W",
  DL: "X",
};

export function defaultLetterScheme(): LetterScheme {
  return { corners: { ...SPEFFZ_CORNERS }, edges: { ...SPEFFZ_EDGES } };
}

/**
 * Buffer priority, as sticker names in the user's frame. Order follows
 * Tobias' buffer sheets. Note corner buffers are stickers (RDF, FDL), not
 * just positions.
 */
export interface BufferConfig {
  edges: string[];
  corners: string[];
}

export function defaultBuffers(): BufferConfig {
  return {
    edges: ["UF", "UB", "UR", "UL", "FR", "FL", "DF", "DB", "DR", "DL"],
    corners: ["UFR", "UBL", "UFL", "UBR", "RDF", "FDL", "LDB"],
  };
}
