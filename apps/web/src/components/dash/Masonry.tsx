import { Children, isValidElement, type ReactNode } from "react";

/**
 * Masonry layout for dashboard cards. Columns fill top to bottom, so a tall chart does not leave
 * gaps beside short cards. Each card is kept whole inside its column (break-inside-avoid).
 * One column on phones, two from `sm`, three from `xl`.
 */
export function Masonry({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`columns-1 gap-4 sm:columns-2 xl:columns-3 ${className}`}>
      {Children.toArray(children).filter(isValidElement).map((child, i) => (
        <div key={i} className="mb-4 break-inside-avoid">
          {child}
        </div>
      ))}
    </div>
  );
}
