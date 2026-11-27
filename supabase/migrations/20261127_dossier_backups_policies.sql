-- 27/11/2026: dossier_backups had RLS aan zonder policies: elke back-up vanuit de app (offerte inlezen,
-- AREI-verdeling, Gegevenscontrole) werd geweigerd ("De back-up is mislukt").
-- Aangemelde gebruikers mogen back-ups maken en lezen (niet wijzigen of wissen).
create policy dossier_backups_insert on public.dossier_backups for insert to authenticated with check (true);
create policy dossier_backups_select on public.dossier_backups for select to authenticated using (true);
