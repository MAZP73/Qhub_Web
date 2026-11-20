-- Correos y avisos en tiempo real.
-- Antes: los correos de avisos esperaban a que pg_cron (cada 30 s) vaciara la cola, así que llegaban hasta 30 s tarde.
-- Ahora: cada aviso nuevo dispara de inmediato la función qhub-correo (pg_net, sale al confirmarse el INSERT) y el cron queda solo
-- como red de seguridad que reintenta lo que falló. Además qhub-push (avisos de turno de la API) se revisa cada 5 s en vez de cada 30 s.
-- La función qhub-correo reclama las filas con `for update skip locked`: un disparo y el cron a la vez no duplican correos.

create or replace function public.disparar_correo() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://dsxmehbusarzkgxzverg.supabase.co/functions/v1/qhub-correo',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'qhub_push_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 20000);
  return null;
exception when others then
  return null;      -- un fallo al avisar nunca debe impedir guardar el aviso; el cron lo envía igual
end $$;
revoke all on function public.disparar_correo() from public, anon, authenticated;

drop trigger if exists correo_inmediato on public.notificaciones_staff;
create trigger correo_inmediato after insert on public.notificaciones_staff for each statement execute function public.disparar_correo();
drop trigger if exists correo_inmediato on public.avisos_cuenta;
create trigger correo_inmediato after insert on public.avisos_cuenta for each statement execute function public.disparar_correo();

select cron.alter_job((select jobid from cron.job where jobname = 'qhub-push'), schedule := '5 seconds');
