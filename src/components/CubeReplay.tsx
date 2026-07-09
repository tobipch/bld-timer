import { createEffect, onCleanup, onMount } from "solid-js";

/**
 * 3D replay (cubing.js TwistyPlayer, lazy-loaded like in algfolded):
 * `setup` brings the cube to the state where something happened, `alg` plays
 * from there. Both are in the user's hand frame (orientation prefixed by the
 * caller), so the replay looks exactly like the solve did.
 */
export function CubeReplay(props: { setup: string; alg: string }) {
  let el!: HTMLDivElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let player: any = null;
  let token = 0;

  const applyAndPlay = () => {
    if (!player) return;
    player.experimentalSetupAlg = props.setup;
    player.alg = props.alg;
    player.jumpToStart();
    if (props.alg.trim()) void player.play();
  };

  onMount(async () => {
    const myToken = ++token;
    const { TwistyPlayer } = await import("cubing/twisty");
    if (myToken !== token) return;
    player = new TwistyPlayer({
      puzzle: "3x3x3",
      visualization: "3D",
      background: "none",
      hintFacelets: "none",
      tempoScale: 2,
    });
    player.style.width = "100%";
    player.style.height = "260px";
    el.appendChild(player);
    applyAndPlay();
  });

  createEffect(() => {
    // re-run when the replay target changes
    void props.setup;
    void props.alg;
    applyAndPlay();
  });

  onCleanup(() => {
    token++;
    player?.remove();
    player = null;
  });

  return <div ref={el} class="cube-replay" />;
}
