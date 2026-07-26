# Circle Calendar v0.3

Prima versiune conectată la Supabase.

## Include
- autentificare reală Supabase;
- profil creat automat prin trigger;
- grupuri reale;
- evenimente salvate și sincronizate;
- upload multiplu foto/video direct în eveniment;
- album automat pentru fiecare eveniment;
- arhivă „Circle Memories”;
- UI responsive și navigare mobilă;
- structură pregătită pentru reutilizarea logicii în aplicația Expo/React Native.

## Configurare locală
1. Copiază `.env.local.example` în `.env.local`.
2. Completează cheia publishable Supabase.
3. Rulează `npm install` și `npm run dev`.

## Vercel
Setează variabilele:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## Important
Schema SQL a fost deja rulată în Supabase. Migrarea este păstrată în repository doar pentru istoric și instalări viitoare.
