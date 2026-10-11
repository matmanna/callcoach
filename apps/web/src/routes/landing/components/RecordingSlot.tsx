import { cn } from "cn";
import type { ReactNode } from "react";
import type { Recording } from "../copy.ts";
import { usePrefersReducedMotion } from "./motion.tsx";

/**
 * A fixed 16:10 frame for a screen recording. With `recording.src` set it plays a muted,
 * looping video (paused with controls under reduced motion). Without one it shows the
 * placeholder (an illustration, labelled as one) at the same size, so swapping a real
 * recording in causes no layout shift.
 */
export function RecordingSlot({ recording, placeholder, className }: { recording: Recording; placeholder?: ReactNode; className?: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <figure className={cn("overflow-hidden rounded-2xl border border-(--lp-hairline) bg-(--lp-surface) p-2 shadow-(--lp-shadow-lift)", className)}>
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-(--lp-bg)">
        {recording.src ? (
          <video
            className="absolute inset-0 size-full object-cover"
            src={recording.src}
            poster={recording.poster}
            aria-label={recording.label}
            muted
            playsInline
            loop
            autoPlay={!reduced}
            controls={reduced}
            preload="metadata"
          />
        ) : (
          <div className="absolute inset-0" data-testid="recording-placeholder">
            {placeholder}
          </div>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-3 px-2 pt-3 pb-1 text-sm text-(--lp-ink-soft)">
        <span>{recording.label}</span>
        {recording.src ? null : <span className="lp-eyebrow shrink-0 !text-[0.65rem]">Illustration · recording soon</span>}
      </figcaption>
    </figure>
  );
}
