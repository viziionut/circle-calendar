# Circle Calendar v6.3 — In-App Notifications

## Instalare

Rulează `supabase/migrations/009_in_app_notifications.sql` în Supabase SQL Editor după migrarea Quick Plan.

Migrarea creează:

- `notifications`;
- `notification_preferences`;
- indexuri pentru istoric, necitite și deduplicare;
- politici RLS;
- integrarea Realtime;
- funcția internă `emit_notification`;
- triggere pentru grupuri, evenimente, vacanțe, Quick Plan și voturi;
- funcția neprogramată `enqueue_scheduled_notifications`.

## Model de securitate

Utilizatorii autentificați nu primesc politică `INSERT` pe `notifications`.
Notificările sunt create exclusiv de funcții `security definer`, care:

1. elimină notificările trimise actorului propriei acțiuni;
2. verifică apartenența destinatarului la grup;
3. verifică preferințele categoriei;
4. folosește `dedupe_key` pentru a evita duplicatele.

RLS permite utilizatorului să citească, actualizeze și șteargă exclusiv propriile notificări.
Preferințele pot fi citite și modificate exclusiv de proprietar.

## Realtime

Clientul deschide un singur canal:

```text
notifications-{userId}
```

Canalul este filtrat prin `user_id=eq.{userId}` și este eliminat la demontarea componentei.
ID-urile deja cunoscute sunt memorate local pentru a evita duplicatele la reconectare.

## Remindere programate

Migrarea nu activează un cron și browserul nu simulează remindere.

Pentru o versiune viitoare:

1. activează extensiile Supabase Cron și `pg_net`, sau configurează Vercel Cron;
2. programează o execuție zilnică, de exemplu la 08:00 UTC;
3. apelează server-side:

```sql
select public.enqueue_scheduled_notifications(current_date);
```

Funcția pregătește:

- `event_tomorrow`;
- `quick_plan_response_due`.

Cheile de deduplicare împiedică repetarea aceleiași notificări în aceeași zi.
Funcția este revocată pentru `anon` și `authenticated`; trebuie apelată doar de un rol privilegiat.

## Push notifications

Nu sunt implementate. O etapă ulterioară necesită:

- tabel separat pentru device/browser subscriptions;
- permisiune explicită din browser;
- Service Worker;
- VAPID sau un furnizor precum FCM;
- rută/functie server-side pentru expediere;
- sincronizare cu aceleași preferințe și categorii;
- gestionarea tokenurilor expirate.

Tabelul `notifications` poate rămâne sursa unică pentru inbox, email și push.

## Scenarii de verificare după instalarea migrării

1. Creează un eveniment cu utilizatorul A; A nu trebuie notificat, ceilalți membri da.
2. Modifică și șterge evenimentul; verifică tipurile și navigarea.
3. Adaugă o vacanță; ceilalți membri primesc contextul țării și perioadei.
4. Creează un Quick Plan; ceilalți membri primesc solicitarea de vot.
5. Votează cu utilizatorul B; creatorul primește votul, B nu primește propria acțiune.
6. Adaugă un comentariu; creatorul primește notificarea de comentariu.
7. Lasă exact un membru fără răspuns; doar acesta primește avertizarea ultimului vot.
8. Marchează o notificare ca citită într-un tab; badge-ul se sincronizează în celălalt.
9. Folosește două grupuri; membrii fără acces nu trebuie să poată interoga notificările celuilalt grup.
10. Creează peste 20 de notificări și verifică butonul „Încarcă mai multe”.
11. Dezactivează fiecare categorie din Settings și repetă acțiunea corespunzătoare.
12. Rulează manual funcția de remindere cu un rol privilegiat și verifică deduplicarea.
