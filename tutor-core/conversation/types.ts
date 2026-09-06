import type { LearnerState } from "../learning/types";

// spec §15 — Tutor Orchestrator input/output.

export interface TutorRequest {
  userId?: string;
  sessionId: string;
  message: string;
  inputMode: "text" | "voice";
}

export interface Source {
  id: string;
  title: string;
  url?: string;
  section?: string;
}

export type TutorEvent =
  | { type: "retrieval_started" }
  | { type: "retrieval_complete"; sources: Source[] }
  | { type: "text_delta"; delta: string }
  | { type: "text_complete"; text: string }
  | { type: "tts_started" }
  | { type: "audio_chunk"; data: string }
  | { type: "state_update"; state: LearnerState }
  | { type: "complete" }
  | { type: "error"; code: string; message: string };

// spec §24 — short-term session context, separate from permanent learner state.
export interface TutorSession {
  id: string;
  userId?: string; // absent for guest sessions — see AGENTS decision: no login in v1
  startedAt: string;

  currentTopic?: string;
  currentLesson?: string;

  conversationSummary?: string;

  mode: "free_chat" | "lesson" | "quiz" | "guided_path";

  voiceEnabled: boolean;
}
