import React from "react";
import { Composition } from "remotion";
import { FPS, Lecture, timeline, TOTAL } from "./Lecture";
import { Strip, stripMetadata, StripProps } from "./Strip";

export const Root: React.FC = () => (
  <>
    <Composition id="Lecture" component={Lecture} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition
      id="Strip"
      component={Strip}
      durationInFrames={1}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ id: timeline[0].id } satisfies StripProps}
      calculateMetadata={({ props }) => stripMetadata(props.id)}
    />
  </>
);
