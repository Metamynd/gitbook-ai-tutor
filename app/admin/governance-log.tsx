"use client";

import { useEffect, useState } from "react";
import { BASE_PATH } from "../lib/base-path";

type GovernanceEvent = {
  actorId: string;
  capability: string;
  resource?: string | null;
  decision: "ALLOW" | "DENY" | "CONSTRAIN" | "REQUIRE_APPROVAL";
  reasonCode?: string | null;
  createdAt: string;
};

const DECISION_COLOR: Record<GovernanceEvent["decision"], string> = {
  ALLOW: "text-emerald-600",
  DENY: "text-red-600",
  CONSTRAIN: "text-amber-600",
  REQUIRE_APPROVAL: "text-amber-600",
};

// spec §61 — "record decision-level evidence rather than token-level
// noise," surfaced here so the governance boundary is actually visible,
// not just architecture nobody can see. Backed today by
// PassthroughGovernanceProvider; every row here is exactly what a real
// a real GovernanceProvider would also produce, decision by decision.
export function GovernanceLog({ token }: { token: string }) {
  const [events, setEvents] = useState<GovernanceEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE_PATH}/api/admin/governance`, { headers: { "x-admin-token": token } })
      .then((r) => r.json())
      .then((data) => setEvents(data.events ?? []))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="mt-8">
      <p className="mb-3 font-mono text-xs uppercase tracking-wide text-gray-400">
        Governance log — last {events.length}
      </p>
      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {!loading && events.length === 0 && <p className="text-sm text-gray-500">No governance events yet.</p>}
      {!loading && events.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="px-3 py-2 font-medium">Capability</th>
                <th className="px-3 py-2 font-medium">Resource</th>
                <th className="px-3 py-2 font-medium">Decision</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {events.map((e, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="px-3 py-2">{e.capability}</td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-gray-500" title={e.resource ?? ""}>
                    {e.resource ?? "—"}
                  </td>
                  <td className={`px-3 py-2 font-medium ${DECISION_COLOR[e.decision]}`}>{e.decision}</td>
                  <td className="px-3 py-2 text-gray-500">{e.reasonCode ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-400">{new Date(e.createdAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
