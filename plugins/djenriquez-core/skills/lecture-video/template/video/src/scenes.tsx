// Scene registry: every scene id in narration.json maps to one component here.
// The examples are patterns to adapt; replace them with the lecture's own scenes.
import React from "react";
import { Commit, Failure, Flow, Intro, Roadmap, States } from "./examples";

export const SCENES: Record<string, React.FC> = {
  intro: Intro,
  flow: Flow,
  failure: Failure,
  commit: Commit,
  states: States,
  roadmap: Roadmap,
};
