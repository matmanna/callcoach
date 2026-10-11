import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** A pastel tint for the page and card, with a stronger ink for the stripe and icon. */
export interface Accent {
  tint: string;
  ink: string;
  icon?: LucideIcon;
}

/**
 * Centered card for sign-in and onboarding. Without an accent it renders as before.
 * With one, the page takes a soft pastel tint, the card gets a colored top stripe, and the
 * step icon sits in a pastel chip beside the title.
 */
export function AuthCard({ title, description, children, accent }: { title: string; description?: string; children: ReactNode; accent?: Accent }) {
  const Icon = accent?.icon;
  return (
    <div
      className={accent ? "flex min-h-screen items-center justify-center px-4 py-10 transition-colors duration-500" : "flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10"}
      style={{ background: accent ? `linear-gradient(180deg, ${accent.tint} 0%, var(--background) 70%)` : undefined }}
    >
      <Card className="w-full max-w-md overflow-hidden border-0 shadow-sm ring-1 ring-black/5" style={accent ? { boxShadow: `0 1px 0 ${accent.ink}22, 0 8px 24px -12px ${accent.ink}55` } : undefined}>
        {accent ? <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${accent.ink}, ${accent.tint})` }} /> : null}
        <CardHeader className="flex-row items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl" style={{ background: accent!.tint, color: accent!.ink }} aria-hidden="true">
              <Icon className="size-5" />
            </span>
          ) : null}
          <div className="space-y-1">
            <CardTitle className="font-heading text-xl">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
