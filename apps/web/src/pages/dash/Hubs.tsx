/**
 * Coordinator hubs. The sidebar has six entries; each one opens a hub that groups the pages it
 * used to list separately. The pages themselves are unchanged.
 */
import { CardHub, TabHub } from "@/components/dash/Hub";
import { Button } from "@/components/ui/button";
import { Import } from "@/pages/coordinator/Import";
import { Invites } from "@/pages/coordinator/Invites";
import { Members } from "@/pages/coordinator/Members";
import { Teams } from "@/pages/coordinator/Teams";
import { Link } from "react-router";
import { AuditPage } from "./Audit";
import { CallsPage } from "./Calls";
import { CampaignsInsightsPage } from "./CampaignsInsights";
import { ContactsPage } from "./Contacts";
import { FactSheetEditorPage } from "./FactSheetEditor";
import { FollowUpsPage } from "./FollowUps";
import { GeographyPage } from "./Geography";
import { HandoffsPage } from "./Handoffs";
import { InsightsPage } from "./Insights";
import { KnowledgePage } from "./Knowledge";
import { QueuePage } from "./Queue";
import { RubricsPage } from "./Rubrics";
import { TimeBandsPage } from "./TimeBands";
import { VolunteersPage } from "./Volunteers";

export function PeopleHub() {
  return (
    <TabHub
      title="People"
      description="Donors, volunteers, and teams."
      tabs={[
        { key: "contacts", label: "Contacts", render: () => <ContactsPage /> },
        { key: "volunteers", label: "Volunteers", render: () => <VolunteersPage /> },
        { key: "teams", label: "Teams", render: () => <Teams /> },
      ]}
    />
  );
}

export function CallsHub() {
  return (
    <TabHub
      title="Calls"
      description="Who needs a decision, what happened on calls, and what is due."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/calls">Make calls</Link>
        </Button>
      }
      tabs={[
        { key: "queue", label: "Queue", render: () => <QueuePage /> },
        { key: "logs", label: "Call logs", render: () => <CallsPage /> },
        { key: "follow-ups", label: "Follow-ups", render: () => <FollowUpsPage /> },
      ]}
    />
  );
}

export function KnowledgeHub() {
  return (
    <TabHub
      title="Knowledge"
      description="What callers may say: fact sheets, the call rubric, guidance, and handoffs."
      tabs={[
        { key: "fact-sheets", label: "Fact sheets", render: () => <FactSheetEditorPage /> },
        { key: "rubrics", label: "Rubrics", render: () => <RubricsPage /> },
        { key: "entries", label: "Guidance", render: () => <KnowledgePage /> },
        { key: "handoffs", label: "Handoffs", render: () => <HandoffsPage /> },
      ]}
    />
  );
}

export function InsightsHub() {
  return (
    <TabHub
      title="Insights"
      description="Patterns across calls. Small groups are hidden."
      tabs={[
        { key: "patterns", label: "Patterns", render: () => <InsightsPage /> },
        { key: "geography", label: "Geography", render: () => <GeographyPage /> },
        { key: "time", label: "Time", render: () => <TimeBandsPage /> },
        { key: "campaigns", label: "Campaigns", render: () => <CampaignsInsightsPage /> },
      ]}
    />
  );
}

export function AdminHub() {
  return (
    <CardHub
      title="Admin"
      description="Data, invitations, members, and the audit log."
      cards={[
        { key: "imports", title: "Imports", description: "Donors, gifts, fact sheets, and rubrics from CSV or JSON.", render: () => <Import /> },
        { key: "invites", title: "Invites", description: "Invitation links for volunteers and coordinators.", render: () => <Invites /> },
        { key: "members", title: "Members", description: "Who is on which team, and in what role.", render: () => <Members /> },
        { key: "audit", title: "Audit log", description: "Every change, in order. Append-only.", render: () => <AuditPage /> },
      ]}
    />
  );
}
