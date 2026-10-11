import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import type { FactItem } from "@sc/shared";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Sheet {
  _id: string;
  name: string;
  items: FactItem[];
  created_at: string;
}

/** Imported items start as drafts. Callers see only approved items. */
export function FactSheets() {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const load = useCallback(async () => {
    try {
      setSheets((await api<{ fact_sheets: Sheet[] }>("/fact-sheets")).fact_sheets);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);
  useEffect(() => void load(), [load]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Fact sheets</h1>
      {!sheets.length ? <p className="text-muted-foreground">No fact sheets yet. Import one from the Import page.</p> : null}
      {sheets.map((s) => (
        <Card key={s._id}>
          <CardHeader>
            <CardTitle>{s.name}</CardTitle>
            <CardDescription>Imported {new Date(s.created_at).toLocaleDateString()}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fact</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="max-w-md whitespace-normal">{i.text}</TableCell>
                    <TableCell className="max-w-48 whitespace-normal text-muted-foreground">{i.source}</TableCell>
                    <TableCell>{i.verified_on}</TableCell>
                    <TableCell>
                      <Badge variant={i.status === "approved" ? "secondary" : "outline"}>{i.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {i.status === "draft" ? (
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              await api(`/fact-sheets/${s._id}/items/${i.id}/approve`, { body: {} });
                              toast.success("Approved");
                              await load();
                            } catch (err) {
                              toast.error(errorMessage(err));
                            }
                          }}
                        >
                          Approve
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
