import { createMemo, For, Index } from "solid-js";
import { identityFrame, parseAlg, rotateFrame } from "~/lib/cube/alg";
import type { Face } from "~/lib/cube/geometry";
import { COLOR_HEX, FACE_COLOR } from "~/lib/engine/colors";
import { settings, setSettings } from "~/state/settings";

/**
 * Letter scheme editor on an unfolded cube (as in algfolded): each face is a
 * 3x3 grid — 3-char cells edit the corner scheme, 2-char cells the edge
 * scheme, the center shows the face in its color. Face colors follow the
 * user's color-scheme/orientation, so the net looks like the cube in hand.
 */

const FACES_GRID: Record<Face, string[]> = {
  U: ["UBL", "UB", "UBR", "UL", "label", "UR", "UFL", "UF", "UFR"],
  L: ["LUB", "LU", "LUF", "LB", "label", "LF", "LDB", "LD", "LDF"],
  F: ["FUL", "FU", "FUR", "FL", "label", "FR", "FDL", "FD", "FDR"],
  R: ["RUF", "RU", "RUB", "RF", "label", "RB", "RDF", "RD", "RDB"],
  B: ["BUR", "BU", "BUL", "BR", "label", "BL", "BDR", "BD", "BDL"],
  D: ["DFL", "DF", "DFR", "DL", "label", "DR", "DBL", "DB", "DBR"],
};

function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#333" : "#fff";
}

export function LetterSchemeCube() {
  /** color shown at each net position, following the user's orientation */
  const faceColors = createMemo<Record<Face, string>>(() => {
    let frame = identityFrame();
    try {
      for (const t of parseAlg(settings.orientation.trim() || "")) {
        if (t.kind === "rotation") frame = rotateFrame(frame, t.base as "x" | "y" | "z", t.amount);
      }
    } catch {
      // invalid orientation: default colors
    }
    const out = {} as Record<Face, string>;
    for (const f of Object.keys(FACES_GRID) as Face[]) {
      out[f] = COLOR_HEX[FACE_COLOR[frame[f]]];
    }
    return out;
  });

  const FaceGrid = (props: { face: Face }) => (
    <div
      class="lsc-grid"
      style={{ "border-color": faceColors()[props.face] }}
    >
      <Index each={FACES_GRID[props.face]}>
        {(cell) =>
          cell() === "label" ? (
            <div
              class="lsc-center"
              style={{
                background: faceColors()[props.face],
                color: contrastText(faceColors()[props.face]),
              }}
            >
              {props.face}
            </div>
          ) : (
            <input
              class="lsc-input mono"
              classList={{ "lsc-edge": cell().length === 2 }}
              maxLength={2}
              title={cell()}
              value={
                (cell().length === 2
                  ? settings.letterScheme.edges[cell()]
                  : settings.letterScheme.corners[cell()]) ?? ""
              }
              onInput={(e) =>
                setSettings(
                  "letterScheme",
                  cell().length === 2 ? "edges" : "corners",
                  cell(),
                  e.currentTarget.value.trim(),
                )
              }
            />
          )
        }
      </Index>
    </div>
  );

  return (
    <div class="lsc-net">
      <div class="lsc-row">
        <div class="lsc-spacer" />
        <FaceGrid face="U" />
      </div>
      <div class="lsc-row">
        <For each={["L", "F", "R", "B"] as Face[]}>{(f) => <FaceGrid face={f} />}</For>
      </div>
      <div class="lsc-row">
        <div class="lsc-spacer" />
        <FaceGrid face="D" />
      </div>
    </div>
  );
}
