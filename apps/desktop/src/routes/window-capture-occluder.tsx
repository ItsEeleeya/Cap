import { Show, Suspense } from "solid-js";
import AreaOccluder from "~/components/AreaOccluder";
import { createCurrentRecordingQuery } from "~/utils/queries";

export default function () {
  const currentRecording = createCurrentRecordingQuery();

  return (
    <Suspense>
      <Show
        when={
          currentRecording.data &&
          currentRecording.data.captureTarget.variant === "window" &&
          currentRecording.data.captureTarget.bounds
        }
      >
        {(bounds) => (
          <AreaOccluder
            position={
              { x: bounds().x, y: bounds().y }
            }
            size={
              { x: bounds().width, y: bounds().height }
            }
            containerSize={{
              x: window.innerWidth, y: window.innerHeight
            }}
          />
        )}
      </Show>
    </Suspense>
  );
}
