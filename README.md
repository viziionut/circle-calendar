# Circle Calendar v0.5.0

## Ce este nou
- click/tap direct pe o zi pentru a crea un eveniment cu data completată;
- glow discret pentru ziua curentă;
- calendar compact/mare, cu modul compact implicit pe telefon;
- palete distincte Bro's (Ocean, Forest, Graphite) și Girls' (Rose, Lavender, Peach);
- locație de eveniment cu Google Places, hartă, pin mutabil și link Google Maps;
- încărcare locală a avatarului păstrată din v0.4.2.

## Actualizare Supabase
Rulează în SQL Editor doar conținutul:
`supabase/migrations/005_event_map_location.sql`

## Google Maps
În Google Cloud activează pentru cheia web:
- Maps JavaScript API
- Places API

Adaugă în Vercel Environment Variables:
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

Restricționează cheia la domeniul Vercel/website. Fără această cheie, evenimentul salvează în continuare locația ca text, dar harta și autocomplete-ul nu apar.
