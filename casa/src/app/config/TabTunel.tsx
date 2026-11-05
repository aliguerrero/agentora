import { useCallback, useEffect, useState } from 'react';
import { pedir } from './configApi';

interface Proveedor {
  id: 'tailscale' | 'cloudflare';
  nombre: string;
  instalado: boolean;
  listo: boolean;
  falta: 'instalar' | 'sesion' | 'responde' | null;
  https?: boolean;
  otrosEquipos?: number;
}
interface Datos {
  estado: 'apagado' | 'abriendo' | 'activo' | 'error';
  error: string | null;
  proveedor: Proveedor['id'] | null;
  url: string | null;
  codigo: string | null;
  requiere: string | null;
  sesiones: number;
  sistema: string;
  proveedores: Proveedor[];
}

const TEXTO: Record<Proveedor['id'], string> = {
  tailscale: 'Privado: solo entran los equipos con tu cuenta de Tailscale. Chats y reuniones van en directo. Recomendado.',
  cloudflare: 'Enlace público: entra cualquier dispositivo que tenga el enlace y el código. Según Cloudflare, estos túneles no admiten el envío en directo que usan los chats y las reuniones, así que pueden fallar.',
};

const Enlace = ({ href, children }: { href: string; children: string }) => (
  <a href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
);

const ESTADO_FALTA: Record<NonNullable<Proveedor['falta']>, string> = {
  instalar: 'No está instalado en este equipo.',
  sesion: 'Instalado, pero sin la sesión iniciada.',
  responde: 'Instalado, pero no responde. Comprueba que el servicio de Tailscale esté en marcha.',
};

/** Lo que tiene que hacer quien recibe la oficina en un equipo sin estas herramientas. */
function Instrucciones({ p, linux }: { p: Proveedor; linux: boolean }) {
  if (p.id === 'tailscale') {
    return (
      <div className="cfg-tunel-pasos">
        <b>En este equipo</b>
        <ol>
          {linux ? (
            <>
              <li>
                Instálalo en una terminal: <code>curl -fsSL https://tailscale.com/install.sh | sh</code>
              </li>
              <li>
                Inicia sesión: <code>sudo tailscale up</code>
              </li>
              <li>
                Permite que tu usuario lo publique sin sudo: <code>sudo tailscale set --operator=$USER</code>
              </li>
            </>
          ) : (
            <>
              <li>
                Descarga <Enlace href="https://tailscale.com/download/windows">Tailscale para Windows</Enlace> e instálalo.
              </li>
              <li>Ábrelo e inicia sesión. Si no tienes cuenta, se crea al entrar.</li>
            </>
          )}
          <li>Vuelve aquí: esta pestaña lo detecta sola y podrás pulsar «Crear túnel».</li>
          <li>La primera vez, Tailscale puede pedirte activar HTTPS con un enlace que aparecerá aquí. Acéptalo y el túnel continúa solo.</li>
        </ol>
        <b>En el otro dispositivo</b>
        <ol>
          <li>
            Instala <Enlace href="https://tailscale.com/download">Tailscale</Enlace> (Windows, Mac, Linux, iPhone o Android) con la misma cuenta y déjalo conectado.
          </li>
          <li>Abre en su navegador la dirección que te da esta pestaña y escribe el código.</li>
        </ol>
        <p>
          <b>Antes de activarlo:</b> HTTPS publica el nombre de este equipo en un registro público de certificados, así que no uses un nombre con datos sensibles. El plan gratuito de Tailscale es solo para uso no comercial:
          si es para una empresa, revisa sus <Enlace href="https://tailscale.com/pricing">planes</Enlace>.
        </p>
      </div>
    );
  }
  return (
    <div className="cfg-tunel-pasos">
      <b>En este equipo</b>
      <ol>
        {linux ? (
          <li>
            Instala cloudflared desde su <Enlace href="https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/">página de descargas</Enlace> y déjalo en el PATH. No necesitas cuenta.
          </li>
        ) : (
          <li>
            Descarga <Enlace href="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi">cloudflared para Windows</Enlace> (64 bits) e instálalo. No necesitas cuenta.
          </li>
        )}
        <li>Vuelve aquí: esta pestaña lo detecta sola y podrás pulsar «Crear túnel».</li>
      </ol>
      <b>En el otro dispositivo</b>
      <ol>
        <li>No hay que instalar nada: abre la dirección en el navegador y escribe el código.</li>
      </ol>
      <p>
        <b>Antes de usarlo:</b> Cloudflare presenta estos túneles para pruebas y desarrollo, sin garantía de disponibilidad. La dirección cambia cada vez. {linux ? '' : 'En Windows, cloudflared no se actualiza solo. '} Más detalles en su{' '}
        <Enlace href="https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/">documentación</Enlace>.
      </p>
    </div>
  );
}

/** Abre y cierra el acceso a la oficina desde otros dispositivos. */
export function TabTunel() {
  const [d, setD] = useState<Datos | null>(null);
  const [elegido, setElegido] = useState<Proveedor['id'] | null>(null);
  const [aviso, setAviso] = useState('');
  const [copiado, setCopiado] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => setD(await pedir<Datos>('/api/tunel')), []);
  useEffect(() => {
    cargar().catch((e: Error) => setAviso(e.message));
    const i = setInterval(() => void cargar().catch(() => {}), 3000);
    return () => clearInterval(i);
  }, [cargar]);

  const accion = async (fn: () => Promise<unknown>) => {
    setOcupado(true);
    setAviso('');
    try {
      await fn();
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      await cargar().catch(() => {});
      setOcupado(false);
    }
  };
  const copiar = async (texto: string, que: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(que);
      setTimeout(() => setCopiado(''), 2000);
    } catch {
      setAviso('No se pudo copiar: selecciónalo y cópialo a mano.');
    }
  };

  if (!d) return <p className="cfg-nota">{aviso || 'Cargando…'}</p>;
  const seleccion = elegido ?? d.proveedores.find((p) => p.listo)?.id ?? 'tailscale';
  const actual = d.proveedores.find((p) => p.id === seleccion);
  const abierto = d.estado === 'activo' || d.estado === 'abriendo';

  return (
    <div className="cfg-form">
      {aviso && <p className="cfg-aviso error">{aviso}</p>}
      {d.estado === 'error' && d.error && <p className="cfg-aviso error">{d.error}</p>}

      {!abierto && (
        <section className="cfg-grupo">
          <h3>Crear un túnel</h3>
          <p className="cfg-nota">Permite entrar a la oficina desde otros dispositivos mientras este equipo y la oficina estén encendidos. Se cierra solo al reiniciar la oficina.</p>
          {d.proveedores.map((p) => (
            <div key={p.id} className="cfg-tunel-proveedor">
              <label className="cfg-tunel-opcion">
                <input type="radio" name="tunel" checked={seleccion === p.id} disabled={!p.listo} onChange={() => setElegido(p.id)} />
                <span>
                  <b>{p.nombre}</b>
                  <small>{TEXTO[p.id]}</small>
                  {p.falta && <small className="cfg-tunel-falta">{ESTADO_FALTA[p.falta]}</small>}
                </span>
              </label>
              <details className="cfg-tunel-ayuda" open={!p.listo}>
                <summary>Cómo prepararlo</summary>
                <Instrucciones p={p} linux={d.sistema === 'linux'} />
              </details>
            </div>
          ))}
          {seleccion === 'tailscale' && actual?.listo && actual.otrosEquipos === 0 && (
            <p className="cfg-nota">Aún no hay otros equipos en tu red: instala Tailscale en el otro dispositivo e inicia sesión con la misma cuenta.</p>
          )}
          <div className="cfg-fila">
            <button
              type="button"
              className="btn principal"
              disabled={ocupado || !actual?.listo}
              onClick={() => void accion(() => pedir('/api/tunel', { method: 'POST', body: JSON.stringify({ proveedor: seleccion }) }))}
            >
              Crear túnel
            </button>
          </div>
        </section>
      )}

      {d.estado === 'abriendo' && (
        <section className="cfg-grupo">
          <h3>Abriendo el túnel…</h3>
          {d.requiere ? (
            <p className="cfg-nota">
              Tailscale necesita que actives esta función una vez:{' '}
              <a href={d.requiere} target="_blank" rel="noreferrer">
                abrir la activación
              </a>
              . El túnel continúa solo al terminar.
            </p>
          ) : (
            <p className="cfg-nota">Puede tardar unos segundos.</p>
          )}
          <div className="cfg-fila">
            <button type="button" className="btn" disabled={ocupado} onClick={() => void accion(() => pedir('/api/tunel', { method: 'DELETE' }))}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      {d.estado === 'activo' && d.url && d.codigo && (
        <section className="cfg-grupo">
          <h3>Túnel abierto · {d.proveedor === 'tailscale' ? 'Tailscale' : 'Cloudflare'}</h3>
          <label>
            Dirección
            <span className="cfg-tunel-dato">
              <input readOnly value={d.url} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn" onClick={() => void copiar(d.url ?? '', 'url')}>
                {copiado === 'url' ? 'Copiada' : 'Copiar'}
              </button>
            </span>
          </label>
          <label>
            Código de acceso
            <span className="cfg-tunel-dato">
              <input readOnly value={d.codigo} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn" onClick={() => void copiar(d.codigo ?? '', 'codigo')}>
                {copiado === 'codigo' ? 'Copiado' : 'Copiar'}
              </button>
            </span>
          </label>
          <p className="cfg-nota">
            Quien tenga la dirección y el código puede dar órdenes a tus agentes: compártelos solo contigo. Dispositivos conectados: {d.sesiones}. Cada entrada dura hasta 12 horas.
          </p>
          <p className="cfg-nota">Desde fuera no se puede tocar este túnel, los secretos, las conexiones ni exportar o restablecer la configuración.</p>
          <div className="cfg-fila">
            <button type="button" className="btn" disabled={ocupado} onClick={() => void accion(() => pedir('/api/tunel', { method: 'DELETE' }))}>
              Cerrar túnel y desconectar a todos
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
