import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { flattenTeams, useSession, type TeamNode } from "@/lib/session";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

type DialogState = { mode: "create"; parent: TeamNode | null } | { mode: "edit"; team: TeamNode } | null;

export function Teams() {
  const { me, refresh } = useSession();
  const rows = flattenTeams(me?.teams ?? []);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [form, setForm] = useState({ name: "", focus: "" });
  const [error, setError] = useState<string | null>(null);

  const open = (d: NonNullable<DialogState>) => {
    setError(null);
    setForm(d.mode === "edit" ? { name: d.team.name, focus: d.team.focus } : { name: "", focus: "" });
    setDialog(d);
  };

  const save = async () => {
    try {
      if (dialog?.mode === "create") await api("/teams", { body: { ...form, parent_team_id: dialog.parent?._id ?? null } });
      else if (dialog?.mode === "edit") await api(`/teams/${dialog.team._id}`, { method: "PATCH", body: form });
      await refresh();
      setDialog(null);
      toast.success("Saved");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const archive = async (t: TeamNode) => {
    try {
      await api(`/teams/${t._id}/archive`, { body: {} });
      await refresh();
      toast.success(`Archived ${t.name}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Teams</h1>
        <Button onClick={() => open({ mode: "create", parent: null })}>New team</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team</TableHead>
            <TableHead>Focus</TableHead>
            <TableHead>Your role</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t._id}>
              <TableCell style={{ paddingLeft: `${0.5 + t.depth * 1.5}rem` }}>
                {t.depth > 0 ? "└ " : ""}
                {t.name}
                {t.depth === 0 ? <Badge variant="secondary" className="ml-2">organization</Badge> : null}
              </TableCell>
              <TableCell className="text-muted-foreground">{t.focus || "—"}</TableCell>
              <TableCell>
                <Badge variant="outline">{t.role}</Badge>
              </TableCell>
              <TableCell className="space-x-2 text-right">
                {t.role === "coordinator" ? (
                  <>
                    {t.depth < 2 ? (
                      <Button size="sm" variant="outline" onClick={() => open({ mode: "create", parent: t })}>
                        Add subteam
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => open({ mode: "edit", team: t })}>
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/coordinator/members?team=${t._id}`}>Members</Link>
                    </Button>
                    {t.depth > 0 ? (
                      <Button size="sm" variant="ghost" onClick={() => archive(t)}>
                        Archive
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? `Edit ${dialog.team.name}` : dialog?.parent ? `New subteam under ${dialog.parent.name}` : "New team"}</DialogTitle>
            <DialogDescription>Focus is a short description of who this team calls.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="team-name">Name</FieldLabel>
              <Input id="team-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="team-focus">Focus</FieldLabel>
              <Input id="team-focus" placeholder="student calling, international donors" value={form.focus} onChange={(e) => setForm({ ...form, focus: e.target.value })} />
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
