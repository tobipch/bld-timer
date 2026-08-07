import { createEffect, onCleanup, onMount } from "solid-js";

/**
 * The 3D cube of the solve player (cubing.js TwistyPlayer, lazy-loaded like
 * in algfolded).
 *
 * Contract: the component shows the state *after* `move` has been applied to
 * `setup`. Stepping forward animates that single move; seeking and stepping
 * back jump straight to the state. Everything is already expressed in the
 * user's holding orientation by the caller, so what is on screen is what they
 * had in their hands.
 */
export function ReplayCube(props: { setup: string; move: string; animate: boolean; size?: number }) {
  let el!: HTMLDivElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let player: any = null;
  let token = 0;

  const apply = () => {
    if (!player) return;
    player.experimentalSetupAlg = props.setup;
    player.alg = props.move;
    if (props.animate && props.move.trim()) {
      player.jumpToStart();
      player.play();
    } else {
      player.jumpToEnd();
    }
  };

  onMount(async () => {
    const myToken = ++token;
    const { TwistyPlayer } = await import("cubing/twisty");
    if (myToken !== token) return;
    player = new TwistyPlayer({
      puzzle: "3x3x3",
      visualization: "3D",
      background: "none",
      controlPanel: "none",
      hintFacelets: "none",
      backView: "top-right",
      tempoScale: 4,
    });
    player.style.width = "100%";
    player.style.height = `${props.size ?? 300}px`;
    el.appendChild(player);
    apply();
  });

  createEffect(() => {
    // re-run whenever the position changes
    void props.setup;
    void props.move;
    apply();
  });

  onCleanup(() => {
    token++;
    player?.remove();
    player = null;
  });

  return <div ref={el} class="replay-cube" />;
}
