# Circle Calendar v0.4

Versiune conectată la Supabase, cu navigare restaurată și flux complet de grupuri.

## Include
- autentificare reală Supabase;
- profil și setări de cont (nume, username, avatar, Bro/Girls, temă);
- creare grup;
- intrare într-un grup cu un cod sau link de invitație;
- distribuire invitație, copiere cod și copiere link;
- evenimente și media în Supabase;
- UI responsive și navigare mobilă.

## Actualizare de la v0.3
Rulează în Supabase SQL Editor:

`supabase/migrations/003_group_invites.sql`

Aceasta instalează funcția securizată `join_group_by_invite_code`.

## Configurare locală
1. Copiază `.env.local.example` în `.env.local`.
2. Completează cheia publishable Supabase.
3. Rulează `npm install` și `npm run dev`.

## Vercel
Setează variabilele:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`


## v0.5.1
- selector nou cu un rând de 8 culori pentru fiecare stil;
- palete Bro's și Girls' separate;
- previzualizare instant în toată aplicația;
- versiunea este afișată clar ca v0.5.1.
