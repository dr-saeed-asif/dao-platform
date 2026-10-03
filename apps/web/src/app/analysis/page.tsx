import Link from "next/link";
import { ResearchRuns } from "@/features/ai/research-runs";

export default function AnalysisPage(){return <main className="dashboard-content"><div className="page-heading"><div><span className="eyebrow">CyberGovAI</span><h1>Research Run History</h1><p>Inspect, compare and export persisted AI experiments.</p></div><Link className="button button-secondary" href="/">Back to AI Assistant</Link></div><ResearchRuns/></main>}
