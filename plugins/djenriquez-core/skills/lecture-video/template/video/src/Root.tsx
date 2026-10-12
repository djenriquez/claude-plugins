import React from "react";
import { Composition } from "remotion";
import { FPS, Lecture, TOTAL } from "./Lecture";

export const Root: React.FC = () => (
  <Composition id="Lecture" component={Lecture} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
);
