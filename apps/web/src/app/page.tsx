import { AppShell } from "@/components/app-shell";
import { GovernanceDashboard } from "@/features/proposals/governance-dashboard";

export default function Home() {
  return (
    <AppShell>
      <GovernanceDashboard />
    </AppShell>
  );
}
