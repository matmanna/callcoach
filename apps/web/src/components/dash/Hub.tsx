/**
 * Hubs group related coordinator pages into one screen. Each tab or card renders an existing
 * page component inside an EmbeddedContext, so the page's own title is hidden and only the
 * hub title shows. The active tab lives in ?tab= so links and refreshes keep their place.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReactNode } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";
import { EmbeddedContext, PageHeader } from "./bits";

/** Set inside a hub so nested pages skip their own page title. */
export function Embedded({ children }: { children: ReactNode }) {
  return <EmbeddedContext.Provider value={true}>{children}</EmbeddedContext.Provider>;
}

export interface HubTab {
  key: string;
  label: string;
  render: () => ReactNode;
}

export function TabHub({ title, description, tabs, actions }: { title: string; description?: string; tabs: HubTab[]; actions?: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const active = tabs.find((t) => t.key === requested) ?? tabs[0]!;
  return (
    <>
      <PageHeader title={title} description={description} actions={actions} />
      <Tabs
        value={active.key}
        onValueChange={(key) => {
          const next = new URLSearchParams(params);
          next.set("tab", key);
          setParams(next);
        }}
      >
        <TabsList className="mb-4 flex-wrap">
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.key} value={t.key}>
            <Embedded>{t.render()}</Embedded>
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

export interface HubCard {
  key: string;
  title: string;
  description: string;
  render: () => ReactNode;
}

/** Stacked cards for admin-style screens. Each card holds one page's content. */
export function CardHub({ title, description, cards }: { title: string; description?: string; cards: HubCard[] }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="space-y-6">
        {cards.map((c) => (
          <Card key={c.key} id={c.key}>
            <CardHeader>
              <CardTitle>{c.title}</CardTitle>
              <CardDescription>{c.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Embedded>{c.render()}</Embedded>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

/** Keeps an old sub-page link working by sending it to the hub tab that now holds it. Team scope is kept. */
export function TabRedirect({ to, tab }: { to: string; tab?: string }) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (tab) params.set("tab", tab);
  return <Navigate to={`${to}?${params.toString()}`} replace />;
}

