// Scene registry: every scene id in narration.json maps to its component and the
// number of beats (sentences) it was animated for. Lecture.tsx refuses to render
// when the narration's beat count differs, because the component's at(i) calls
// would otherwise land on the wrong sentences without any error.
// The examples are patterns to adapt; replace them with the lecture's own scenes.
import React from "react";
import { Change, Commit, Failure, Flow, Intro, Outro, Review, Roadmap, States } from "./examples";

export type SceneDef = { component: React.FC; beats: number };

export const SCENES: Record<string, SceneDef> = {
  intro: { component: Intro, beats: 4 },
  flow: { component: Flow, beats: 5 },
  change: { component: Change, beats: 5 },
  failure: { component: Failure, beats: 4 },
  commit: { component: Commit, beats: 5 },
  states: { component: States, beats: 5 },
  roadmap: { component: Roadmap, beats: 5 },
  review: { component: Review, beats: 6 },
  outro: { component: Outro, beats: 4 },
};
