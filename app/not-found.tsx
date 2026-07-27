import { BrandMark } from "@/components/Brand";

export default function NotFound() {
  return <main className="brandStatusPage"><BrandMark/><small>EROARE 404</small><h1>Ai ieșit din cerc.</h1><p>Pagina pe care o cauți nu există sau a fost mutată.</p><a className="primary" href="/">Înapoi în Circle Calendar</a><footer>Circle Calendar · Plan. Share. Remember.</footer></main>;
}
