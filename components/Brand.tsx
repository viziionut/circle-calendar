import type { CSSProperties } from "react";

export function BrandMark({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <img className={`brandMark ${className}`} src="/brand/icon.svg" alt="Circle Calendar" width="48" height="48" style={style}/>;
}

export function BrandLogo({ className = "" }: { className?: string }) {
  return <img className={`brandLogo ${className}`} src="/brand/logo-dark.svg" alt="Circle Calendar — Plan. Share. Remember." width="460" height="110"/>;
}

export function BrandLoader({ label = "Se încarcă…" }: { label?: string }) {
  return <div className="brandLoader" role="status" aria-live="polite">
    <span className="brandLoaderOrbit"><BrandMark/></span>
    <strong>Circle Calendar</strong>
    <small>PLAN. SHARE. REMEMBER.</small>
    <span className="brandLoaderLine"><i/></span>
    <p>{label}</p>
  </div>;
}
