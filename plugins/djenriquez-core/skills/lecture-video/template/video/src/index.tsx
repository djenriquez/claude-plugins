// Browser entry that render.mjs bundles and opens in headless Chrome. The page
// shows one composition, ?comp=Lecture or ?comp=Strip&id=<scene>, and exposes
// window.lecture so the renderer can draw any frame and screenshot it.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-800.css";
import "@fontsource/inter/latin-900.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Freeze, HEIGHT, WIDTH } from "./engine";
import { Lecture, TOTAL } from "./Lecture";
import { FONT_FACES } from "./lib";
import { Strip, stripHeight } from "./Strip";

type Page = { width: number; height: number; frames: number; frame: (n: number) => Promise<void> };
declare global {
  interface Window {
    lecture?: Page;
    lectureError?: string;
  }
}

const setup = async (): Promise<Page> => {
  const q = new URLSearchParams(location.search);
  const comp = q.get("comp") ?? "Lecture";
  const id = q.get("id") ?? "";
  const compositions: Record<string, () => { View: React.FC; height: number; frames: number }> = {
    Lecture: () => ({ View: Lecture, height: HEIGHT, frames: TOTAL }),
    Strip: () => ({ View: () => <Strip id={id} />, height: stripHeight(id), frames: 1 }),
  };
  if (!compositions[comp]) throw new Error(`unknown composition "${comp}"`);
  const { View, height, frames } = compositions[comp]();
  await Promise.all(FONT_FACES.map((f) => document.fonts.load(f)));
  // React reports render errors through this callback instead of throwing, and
  // unmounts the tree; frame() rethrows so a broken scene fails the render
  // instead of producing blank frames.
  let failure: unknown = null;
  const root = createRoot(document.getElementById("root")!, { onUncaughtError: (e) => (failure ??= e) });
  return {
    width: WIDTH,
    height,
    frames,
    frame: async (n) => {
      if (failure) throw failure;
      flushSync(() =>
        root.render(
          <div style={{ position: "relative", width: WIDTH, height, overflow: "hidden" }}>
            <Freeze frame={n}>
              <View />
            </Freeze>
          </div>,
        ),
      );
      if (failure) throw failure;
      await document.fonts.ready;
    },
  };
};

setup().then(
  (page) => (window.lecture = page),
  (e: unknown) => (window.lectureError = e instanceof Error ? e.message : String(e)),
);
