/** Queue the next frame before work, so one render exception cannot kill RAF. */
export function startFrames(
  schedule: (fn: () => void) => unknown,
  work: () => void,
  onError: (e: unknown) => void,
) {
  const frame = () => {
    schedule(frame);
    try {
      work();
    } catch (error) {
      onError(error);
    }
  };
  frame();
}
