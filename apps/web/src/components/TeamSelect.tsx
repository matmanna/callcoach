import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { flattenTeams, useSession } from "@/lib/session";

/** Teams the user coordinates, indented by depth. */
export function TeamSelect({ value, onChange, id, includeNone }: { value: string; onChange: (id: string) => void; id?: string; includeNone?: string }) {
  const { me } = useSession();
  const teams = flattenTeams(me?.teams ?? []).filter((t) => t.role === "coordinator");
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full sm:w-72">
        <SelectValue placeholder="Choose a team" />
      </SelectTrigger>
      <SelectContent>
        {includeNone ? <SelectItem value="none">{includeNone}</SelectItem> : null}
        {teams.map((t) => (
          <SelectItem key={t._id} value={t._id}>
            {"  ".repeat(t.depth)}
            {t.depth ? "└ " : ""}
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
