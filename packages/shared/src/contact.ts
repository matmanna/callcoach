/** Public landing-page contact form (Prompt L1). Shared by the web form and the API stub. */
import { z } from "zod";

export const TeamSize = z.enum(["1-5", "6-15", "16-50", "51+"]);
export type TeamSize = z.infer<typeof TeamSize>;

const text = (label: string, max: number) => z.string().trim().min(1, `Please add your ${label}.`).max(max, `Keep this under ${max} characters.`);

export const ContactRequest = z.object({
  name: text("name", 120),
  email: z.string().trim().email("Please add an email we can reply to."),
  organization: text("organization", 160),
  role: text("role", 120),
  team_size: z.enum(TeamSize.options, { error: "Pick a team size." }),
  message: z.string().trim().max(2000, "Keep this under 2000 characters.").default(""),
});
export type ContactRequest = z.infer<typeof ContactRequest>;
