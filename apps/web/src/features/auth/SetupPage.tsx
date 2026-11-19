import { useEffect, useRef, useState } from 'react';
import type { Failure } from '@qhub/core';
import { Button, Logo, Notice } from '@/shared/ui';
import { useContainer, useSession } from '@/app/container';
import { CONFIRMED_KEY } from '@/features/session/app-session';
import { slugify } from '@qhub/core';

/**
 * Persona con sesión pero sin organización. Ya no hay formulario: la organización se elige al crear la cuenta (y se crea al confirmar el
 * correo) y los equipos se unen con el código de invitación desde el inicio de sesión. Aquí solo se completa, sola, lo que quedó pendiente.
 */
export function SetupPage() {
  const { staff } = useContainer();
  const { session } = useSession();
  const pre = session.user?.pendingOrg;       // lo que eligió al crear la cuenta
  const needsPassword = !session.hasHeldPassword;     // entró por el enlace del correo: no la escribió
  const [error, setError] = useState<Failure | null>(null);
  const auto = useRef(false);

  // Ya eligió todo al crear la cuenta: se crea la organización sola.
  useEffect(() => {
    if (!pre || auto.current || needsPassword || !pre.city) return;
    auto.current = true;
    void (async () => {
      const r = await staff.createOrganization({ name: pre.name, kind: pre.kind, slug: `${slugify(pre.name)}-${Date.now() % 100000}`, city: pre.city || undefined, country: pre.country || undefined, timeZone: pre.timeZone });
      if (r.ok) await session.loadMemberships(); else setError(r.failure);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sin la contraseña en memoria (entró por el enlace del correo) o sin nada pendiente: se vuelve al inicio de sesión, donde se crea y conecta todo.
  const toLogin = !error && (Boolean(pre) ? needsPassword : true);
  useEffect(() => {
    if (!toLogin) return;
    if (pre) { try { sessionStorage.setItem(CONFIRMED_KEY, '1'); } catch { /* sin storage */ } }
    void session.signOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toLogin]);

  if (error) return (
    <main id="contenido" className="grid min-h-full place-items-center p-6">
      <div className="flex w-[min(460px,100%)] flex-col gap-4">
        <Logo height={28} />
        <Notice kind="error" title={error.message} message="No pudimos crear tu organización. Cierra sesión e inténtalo de nuevo." />
        <div><Button onClick={() => void session.signOut()}>Cerrar sesión</Button></div>
      </div>
    </main>
  );
  return <div role="status" aria-label="Cargando" className="grid h-full place-items-center"><Logo height={32} /></div>;
}
