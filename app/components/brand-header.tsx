import { tutorConfig } from "@/config/tutor.config";

// A generic inline mark + wordmark — no external image file needed, so
// the template doesn't ship anyone's actual logo. Swap this whole
// component for your own <img>/<Image> logo when you re-skin the tutor
// (see README "Branding"); everything else in the app just imports
// BrandHeader, so that's the only file that needs to change.
export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="flex items-center justify-between border-b border-black/5 pb-4">
      <div className="flex items-center gap-2">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="brand-mark-gradient" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6366F1" />
              <stop offset="1" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
          <rect width="28" height="28" rx="8" fill="url(#brand-mark-gradient)" />
          <path
            d="M8 18.5V9.5L14 15L20 9.5V18.5"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-lg font-semibold tracking-tight text-brand-slate">{tutorConfig.tutorName}</span>
      </div>
      {subtitle && (
        <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-gray-400">
          <span className="h-1.5 w-1.5 rounded-full bg-gradient-brand-primary" />
          {subtitle}
        </p>
      )}
    </header>
  );
}
