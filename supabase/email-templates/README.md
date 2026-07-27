# Circle Calendar v6.1 — Supabase Email Templates

Template-urile din acest director sunt HTML complet, gata de copiat în proiectul Supabase găzduit.

## Instalare în Supabase Dashboard

1. Deschide proiectul Circle Calendar în [Supabase Dashboard](https://supabase.com/dashboard).
2. Din meniul proiectului intră în **Authentication**.
3. Deschide **Email Templates**.
4. Pentru fiecare tip de email:
   - selectează template-ul din Dashboard;
   - setează subiectul recomandat din tabelul de mai jos;
   - deschide fișierul HTML corespunzător din acest director;
   - copiază întregul conținut, de la `<!doctype html>` până la `</html>`;
   - înlocuiește complet conținutul câmpului **Message body / Body**;
   - apasă **Save changes**.
5. Trimite câte un email de test pentru fiecare flux.

| Secțiune Supabase | Subiect recomandat | Fișier |
|---|---|---|
| Confirm signup | `Confirmă contul Circle Calendar` | `confirm-signup.html` |
| Reset password | `Resetează parola Circle Calendar` | `reset-password.html` |
| Magic link | `Linkul tău de acces Circle Calendar` | `magic-link.html` |
| Invite user | `Ai primit o invitație în Circle Calendar` | `invite-user.html` |
| Change email address | `Confirmă noua adresă Circle Calendar` | `change-email.html` |

În unele versiuni ale Dashboard-ului, denumirile apar ca **Confirm Signup**, **Reset Password**, **Magic Link**, **Invite User** și **Change Email**.

## Variabile Supabase folosite

- `{{ .ConfirmationURL }}` — URL-ul unic de confirmare, recuperare, autentificare sau invitație.
- `{{ .NewEmail }}` — noua adresă, disponibilă exclusiv în template-ul Change Email.
- `{{ .SiteURL }}` — domeniul aplicației, folosit pentru încărcarea logo-ului oficial din `/brand/icon.svg`.

Nu înlocui manual aceste expresii. Supabase le completează la trimitere.

## Configurare obligatorie

În **Authentication → URL Configuration** verifică:

- **Site URL** indică domeniul de producție Circle Calendar;
- toate domeniile locale și de producție necesare există în **Redirect URLs**.

Pentru producție este recomandat și un furnizor SMTP propriu în **Project Settings → Authentication → SMTP Settings**. Dezactivează rescrierea/tracking-ul linkurilor în furnizorul SMTP, deoarece poate invalida linkurile de autentificare.

## Compatibilitate

Template-urile folosesc:

- layout pe tabele;
- CSS critic inline;
- fonturi de sistem;
- butoane bazate pe linkuri HTML;
- lățime maximă de 600 px;
- reguli responsive minimale în `<style>`;
- text alternativ sub formă de link complet;
- fără JavaScript, fonturi externe sau imagini obligatorii.

Logo-ul folosește domeniul configurat în `Site URL`. Dacă imaginile sunt blocate de clientul de email, atributul alternativ păstrează vizibil numele „Circle Calendar”.

Aceste alegeri urmăresc compatibilitatea cu Gmail, Outlook, Apple Mail, Yahoo Mail, telefon și desktop. Umbrele și colțurile rotunjite se degradează elegant în clienții Outlook mai vechi.

## Observație despre invitațiile în grup

Template-ul Supabase **Invite User** este trimis doar când un utilizator este invitat prin mecanismul Supabase Auth, de exemplu `inviteUserByEmail`. Invitațiile existente din Circle Calendar, distribuite prin cod sau link de grup, nu trimit momentan email prin Supabase Auth. Fișierul `invite-user.html` nu schimbă această logică și nu introduce automat trimiterea emailurilor de grup.

## Testare recomandată

Testează cel puțin:

1. înregistrarea unui cont nou;
2. solicitarea resetării parolei;
3. autentificarea Magic Link, dacă este activă;
4. o invitație Auth trimisă din Supabase;
5. schimbarea adresei de email.

Verifică atât tema luminoasă, cât și tema întunecată a clientului de email și confirmă că linkul brut poate fi copiat.
