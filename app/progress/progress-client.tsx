"use client";

import { useEffect, useState } from "react";
import { BrandHeader } from "../components/brand-header";
import { BASE_PATH } from "../lib/base-path";

type TopicProgress = { id: string; title: string; mastery: number; attempts: number };
type LearningPathProgress = {
  id: string;
  title: string;
  description: string;
  topics: { id: string; title: string; mastery: number }[];
};

const ANONYMOUS_ID_KEY = "tutor_anonymous_id";

function masteryLabel(mastery: number): string {
  if (mastery >= 0.75) return "Competent+";
  if (mastery >= 0.5) return "Partial";
  if (mastery >= 0.25) return "Introduced";
  return "Not started";
}

export function ProgressClient() {
  const [topics, setTopics] = useState<TopicProgress[]>([]);
  const [learningPaths, setLearningPaths] = useState<LearningPathProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const anonymousId = localStorage.getItem(ANONYMOUS_ID_KEY);
    if (!anonymousId) {
      setLoading(false);
      return;
    }

    fetch(`${BASE_PATH}/api/learner/progress?anonymousId=${anonymousId}`)
      .then((r) => r.json())
      .then((data) => {
        setTopics(data.topics ?? []);
        setLearningPaths(data.learningPaths ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-6">
        <BrandHeader subtitle="My progress" />
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}

      {!loading && learningPaths.length > 0 && (
        <section className="mb-8">
          {learningPaths.map((path) => (
            <div key={path.id} className="mb-4 rounded-2xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-brand-slate">{path.title}</h2>
              <p className="mt-1 text-xs text-gray-500">{path.description}</p>
              <ol className="mt-3 space-y-2">
                {path.topics.map((t, i) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-gray-400">{i + 1}.</span>
                    <span className="flex-1">{t.title}</span>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full bg-gradient-brand-primary"
                        style={{ width: `${Math.round(t.mastery * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}

      {!loading && (
        <section>
          <p className="mb-3 font-mono text-xs uppercase tracking-wide text-gray-400">All topics</p>
          <div className="space-y-2">
            {topics.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-sm">
                <span className="flex-1">{t.title}</span>
                <span className="font-mono text-xs text-gray-400">{masteryLabel(t.mastery)}</span>
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full bg-gradient-brand-primary"
                    style={{ width: `${Math.round(t.mastery * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <a href={`${BASE_PATH}/`} className="mt-6 inline-block text-sm text-[#6366F1] underline">
        Back to the tutor
      </a>
    </div>
  );
}
