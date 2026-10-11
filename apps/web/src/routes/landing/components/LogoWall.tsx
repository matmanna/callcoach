import { cn } from "cn";

/**
 * One organization that has given written permission to appear. Add entries only when
 * permission is on file. `src` is an SVG or PNG under apps/web/public/logos/.
 */
export type Logo = { name: string; src: string; href?: string };

const tile = "lp-lift lp-logo flex h-20 items-center justify-center rounded-2xl border border-(--lp-hairline) bg-white/80 px-4 outline-none";

/** Grey placeholder mark at the same size a real logo will take, so swapping causes no shift. */
function PlaceholderMark({ label }: { label: string }) {
  return (
    <li>
      <div tabIndex={0} className={cn(tile, "gap-2.5")} data-testid="logo-placeholder">
        <span aria-hidden="true" className="size-4 shrink-0 rounded-[5px] bg-current opacity-40" />
        <span className="text-[0.8rem] font-medium whitespace-nowrap">{label}</span>
      </div>
    </li>
  );
}

function LogoMark({ logo }: { logo: Logo }) {
  const img = <img src={logo.src} alt={logo.name} className="max-h-8 w-auto max-w-full" loading="lazy" decoding="async" />;
  return (
    <li>
      {logo.href ? (
        <a href={logo.href} className={tile} rel="noopener noreferrer">
          {img}
        </a>
      ) : (
        <div tabIndex={0} className={tile}>
          {img}
        </div>
      )}
    </li>
  );
}

/** Renders `logos`, or `placeholderCount` placeholders when the array is empty. */
export function LogoWall({ logos = [], placeholderCount = 4, placeholderLabel }: { logos?: readonly Logo[]; placeholderCount?: number; placeholderLabel: string }) {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {logos.length
        ? logos.map((logo) => <LogoMark key={logo.name} logo={logo} />)
        : Array.from({ length: placeholderCount }, (_, i) => <PlaceholderMark key={i} label={placeholderLabel} />)}
    </ul>
  );
}
