"use client";

import { BrandMark } from "@/components/Brand";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="brandStatusPage"><BrandMark/><small>CEVA NU A MERS</small><h1>Cercul s-a întrerupt.</h1><p>Nu am putut încărca această pagină. Datele tale sunt în siguranță.</p><button className="primary" onClick={reset}>Încearcă din nou</button><footer>Circle Calendar · Plan. Share. Remember.</footer></main>;
}
