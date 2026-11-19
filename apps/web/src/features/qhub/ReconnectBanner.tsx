import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon, useToast } from '@/shared/ui';
import { useSession } from '@/app/container';
import { can } from '@/features/staff';

/**
 * La conexión con Qhub ya se confirmó (lo registra la base de datos), así que no hay pantalla de conectar. Si en esta sesión
 * falta el token y no hay conexión guardada que lo renueve, se avisa aquí. El administrador vuelve a escribir su cuenta de Qhub;
 * los demás integrantes no conocen esa contraseña, así que se reconecta sola con la conexión guardada en el servidor y, si no
 * se puede, se avisa a los administradores para que ellos reconecten.
 */
export function ReconnectBanner() {
  const { session, connection } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const isAdmin = can(session.membership?.role, 'settings.manage');
  const everConnected = !!session.membership?.organization.qhubConnected;
  const needed = !!session.membership && connection.status === 'disconnected';      // también si nunca se conectó: ya no hay pantalla de conectar
  // administrador conectado solo en este dispositivo: la conexión no está en el servidor y los demás integrantes no pueden conectarse
  const unsaved = isAdmin && !!session.membership?.organization.qhubConnected && !session.membership.organization.linked && connection.status === 'connected';
  if (!needed && !unsaved) return null;

  // integrante que no es admin: reconexión automática por servidor + aviso al admin si falla (sin pedir credenciales)
  async function onReconnect() {
    if (isAdmin) { navigate('/ajustes#conexion'); return; }       // el administrador restablece la conexión en Ajustes → Conexión con Qhub
    setBusy(true);
    const r = await session.autoReconnectOrNotify();
    setBusy(false);
    toast.show(r === 'ok' ? 'Conectado con Qhub.' : 'Le avisamos a tu administrador para que reconecte la cuenta de Qhub.');
  }

  return (
    <>
    {unsaved && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 border border-border-subtle border-l-[3px] border-l-support-warning bg-layer-01 p-4 print:hidden">
      <span className="text-support-warning"><Icon name="warning" /></span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">La conexión con Qhub no está guardada en el servidor</div>
        <div className="t-caption text-text-secondary">Solo funciona en este dispositivo. Guárdala para que el resto del equipo y tus otros dispositivos se conecten solos.</div>
      </div>
      <Button size="sm" onClick={() => navigate('/ajustes#conexion')}>Guardar conexión</Button>
    </div>}
    {needed && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 border border-border-subtle border-l-[3px] border-l-support-warning bg-layer-01 p-4 print:hidden">
      <span className="text-support-warning"><Icon name="warning" /></span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{everConnected ? 'Falta reconectar con Qhub' : 'Falta conectar con Qhub'}</div>
        <div className="t-caption text-text-secondary">{(connection.status === 'disconnected' && connection.reason?.message) || (everConnected ? 'Para cargar tus colas y turnos necesitamos volver a conectar tu cuenta de Qhub.' : 'Para gestionar colas y turnos hace falta conectar tu cuenta de Qhub.')}</div>
      </div>
      <Button size="sm" loading={busy} onClick={() => void onReconnect()}>{isAdmin ? 'Ir a Ajustes' : 'Reconectar'}</Button>
    </div>}
    </>
  );
}
