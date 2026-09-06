"use client";

import { useEffect, useState } from "react";
import { BrandHeader } from "../components/brand-header";
import { GovernanceLog } from "./governance-log";
import { BASE_PATH } from "../lib/base-path";

const TOKEN_KEY = "tutor_admin_token";

export function AdminSettingsClient() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [pedagogicalModeEnabled, setPedagogicalModeEnabled] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthorized" | "saving" | "saved" | "error">(
    "loading"
  );

  function load(withToken: string) {
    setStatus("loading");
    fetch(`${BASE_PATH}/api/admin/settings`, { headers: { "x-admin-token": withToken } })
      .then((r) => {
        if (r.status === 401) {
          setStatus("unauthorized");
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setCustomPrompt(data.customPrompt ?? "");
        setPedagogicalModeEnabled(!!data.pedagogicalModeEnabled);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      setToken(stored);
      load(stored);
    } else {
      setStatus("unauthorized");
    }
  }, []);

  function handleTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    localStorage.setItem(TOKEN_KEY, tokenInput.trim());
    setToken(tokenInput.trim());
    load(tokenInput.trim());
  }

  async function handleSave() {
    if (!token) return;
    setStatus("saving");
    try {
      const res = await fetch(`${BASE_PATH}/api/admin/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ customPrompt, pedagogicalModeEnabled }),
      });
      if (res.status === 401) {
        setStatus("unauthorized");
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        return;
      }
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  if (status === "unauthorized" || !token) {
    return (
      <div className="mx-auto max-w-md p-8">
        <div className="mb-8">
          <BrandHeader subtitle="Tutor settings" />
        </div>
        <p className="mb-3 text-sm text-gray-600">Enter the admin token to continue.</p>
        <form onSubmit={handleTokenSubmit} className="flex gap-2">
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Admin token"
            className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50"
          />
          <button
            type="submit"
            className="rounded-full bg-gradient-brand-primary px-5 py-2 text-sm font-medium text-white"
          >
            Continue
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-8">
        <BrandHeader subtitle="Tutor settings" />
      </div>
      <p className="mb-6 text-sm text-gray-500">
        Applies to every conversation immediately — this is global config for this deployment, not per-user.
      </p>

      <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4">
        <label className="mb-1 flex items-center gap-2 text-sm font-medium text-brand-slate">
          <input
            type="checkbox"
            checked={pedagogicalModeEnabled}
            onChange={(e) => setPedagogicalModeEnabled(e.target.checked)}
            className="h-4 w-4 accent-[#6366F1]"
          />
          Activate Pedagogical Tutor (Socratic mode)
        </label>
        <p className="ml-6 text-xs text-gray-500">
          Guides the learner with questions instead of giving answers directly. Combines with the custom
          prompt below rather than replacing it.
        </p>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-brand-slate">Custom prompt</label>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          rows={10}
          placeholder="Additional instructions appended to the tutor's system prompt..."
          className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 font-mono text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={status === "saving"}
        className="rounded-full bg-gradient-brand-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {status === "saving" ? "Saving..." : "Save"}
      </button>
      {status === "saved" && <span className="ml-3 text-sm text-emerald-600">Saved.</span>}
      {status === "error" && <span className="ml-3 text-sm text-red-600">Something went wrong.</span>}

      <GovernanceLog token={token} />
    </div>
  );
}
