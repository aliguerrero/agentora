import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { guardarSeccion, hace, pedir } from './configApi';

interface ConfigCorreo {
  activo: boolean;
  host: string;
  puerto: number;
  seguridad: 'starttls' | 'tls' | 'ninguna';
  usuario: string;
  remitenteNombre: string;
  remitenteCorreo: string;
  firma: string;
}
interface Registro {
  fecha: string;
  canal: string;
  direccion: string;
  para?: string;
  persona?: string;
  asunto?: string;
  ok?: boolean;
  error?: string;
  quien?: string;
}

const PRESETS: Record<string, Partial<ConfigCorreo> & { nota: string }> = {
  Gmail: { host: 'smtp.gmail.com', puerto: 587, seguridad: 'starttls', nota: 'Gmail exige una contraseña de aplicación (con verificación en dos pasos): myaccount.google.com/apppasswords.' },
  'Outlook / Microsoft 365': { host: 'smtp.office365.com', puerto: 587, seguridad: 'starttls', nota: 'Tu organización debe tener habilitado «SMTP AUTH» para el buzón.' },
  'Zoho Mail': { host: 'smtp.zoho.com', puerto: 465, seguridad: 'tls', nota: 'Usa una contraseña específica de aplicación si tienes 2FA.' },
};

/** Correo saliente por SMTP: servidor, remitente, contraseña cifrada, envío de prueba y registro. */
export function TabCorreo() {
  const [c, setC] = useState<ConfigCorreo | null>(null);
  const [original, setOriginal] = useState<ConfigCorreo | null>(null);
  const [password, setPassword] = useState<{ pista: string } | null>(null);
  const [nuevaClave, setNuevaClave] = useState('');
  const [para, setPara] = useState('');
  const [registro, setRegistro] = useState<Registro[]>([]);
  const [nota, setNota] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const d = await pedir<{ config: ConfigCorreo; password: { pista: string } | null; registro: Registro[] }>('/api/correo');
    setC(d.config);
    setOriginal(d.config);
    setPassword(d.password);
    setRegistro(d.registro);
  }, []);
  useEffect(() => {
    cargar().catch((err: Error) => setAviso({ tipo: 'error', texto: err.message }));
  }, [cargar]);

  if (!c || !original) return <p className="cfg-nota">{aviso?.texto || 'Cargando…'}</p>;
  const cambiado = JSON.stringify(c) !== JSON.stringify(original);
  const campo = <K extends keyof ConfigCorreo>(k: K, v: ConfigCorreo[K]) => setC((x) => (x ? { ...x, [k]: v } : x));

  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await fn();
      setAviso({ tipo: 'ok', texto: ok });
      await cargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: (err as Error).message });
      await cargar().catch(() => {});
    } finally {
      setOcupado(false);
    }
  };
  const guardar = (ev: FormEvent) => {
    ev.preventDefault();
    void accion(() => guardarSeccion('correo', c), 'Configuración de correo guardada.');
  };

  return (
    <form className="cfg-form" onSubmit={guardar}>
      {aviso && <p className={`cfg-aviso ${aviso.tipo}`}>{aviso.texto}</p>}

      <div className="cfg-linea">
        <div>
          <b>Correo saliente {c.activo ? 'activo' : 'desactivado'}</b>
          <span>Los agentes podrán avisar por correo a tu equipo (según la política de contacto).</span>
        </div>
        <button type="button" role="switch" aria-checked={c.activo} aria-label="Correo activo" className="cfg-switch" onClick={() => campo('activo', !c.activo)}>
          <i />
        </button>
      </div>

      <section className="cfg-grupo">
        <h3>Servidor SMTP</h3>
        <div className="cfg-fila">
          {Object.entries(PRESETS).map(([nombre, p]) => (
            <button
              key={nombre}
              type="button"
              className="btn"
              onClick={() => {
                setC((x) => (x ? { ...x, host: p.host!, puerto: p.puerto!, seguridad: p.seguridad! } : x));
                setNota(p.nota);
              }}
            >
              {nombre}
            </button>
          ))}
        </div>
        {nota && <p className="cfg-nota">{nota}</p>}
        <div className="cfg-fila">
          <label>
            Servidor
            <input value={c.host} onChange={(e) => campo('host', e.target.value.trim())} placeholder="smtp.gmail.com" spellCheck={false} />
          </label>
          <label className="cfg-corto">
            Puerto
            <input type="number" min={1} max={65535} value={c.puerto} onChange={(e) => campo('puerto', Number(e.target.value))} />
          </label>
          <label>
            Seguridad
            <select value={c.seguridad} onChange={(e) => campo('seguridad', e.target.value as ConfigCorreo['seguridad'])}>
              <option value="starttls">STARTTLS (587)</option>
              <option value="tls">TLS directo (465)</option>
              <option value="ninguna">Sin cifrado (solo relé local)</option>
            </select>
          </label>
        </div>
        {c.seguridad === 'ninguna' && <p className="cfg-aviso error">Sin cifrado, la contraseña y los correos viajan en claro. Úsalo solo con un relé en este equipo.</p>}
        <label>
          Usuario (normalmente tu correo)
          <input value={c.usuario} onChange={(e) => campo('usuario', e.target.value.trim())} autoComplete="off" spellCheck={false} />
        </label>
      </section>

      <section className="cfg-grupo">
        <h3>Remitente</h3>
        <div className="cfg-fila">
          <label>
            Nombre
            <input value={c.remitenteNombre} maxLength={80} onChange={(e) => campo('remitenteNombre', e.target.value)} placeholder="Oficina de IA" />
          </label>
          <label>
            Correo
            <input type="email" value={c.remitenteCorreo} onChange={(e) => campo('remitenteCorreo', e.target.value.trim())} placeholder="oficina@tuempresa.com" />
          </label>
        </div>
        <label>
          Firma (se añade a cada correo)
          <textarea rows={3} maxLength={1000} value={c.firma} onChange={(e) => campo('firma', e.target.value)} placeholder={'—\nEnviado por un agente de IA de la oficina.'} />
        </label>
      </section>

      <div className="cfg-acciones">
        <button type="button" className="btn" disabled={!cambiado || ocupado} onClick={() => setC(original)}>
          Descartar
        </button>
        <button type="submit" className="btn principal" disabled={!cambiado || ocupado}>
          Guardar
        </button>
      </div>

      <section className="cfg-grupo">
        <h3>Contraseña {password ? `(guardada ${password.pista})` : '(sin configurar)'}</h3>
        <div className="cfg-fila">
          <input type="password" value={nuevaClave} onChange={(e) => setNuevaClave(e.target.value)} placeholder="Contraseña de aplicación" autoComplete="new-password" style={{ flex: 1 }} />
          <button
            type="button"
            className="btn principal"
            disabled={ocupado || !nuevaClave}
            onClick={() =>
              void accion(async () => {
                await pedir('/api/config/secretos/SMTP_PASSWORD', { method: 'PUT', body: JSON.stringify({ valor: nuevaClave }) });
                setNuevaClave('');
              }, 'Contraseña guardada cifrada.')
            }
          >
            Guardar contraseña
          </button>
        </div>
        <p className="cfg-nota">Se guarda cifrada en este equipo y nunca se vuelve a mostrar ni la leen los agentes.</p>
      </section>

      <section className="cfg-grupo">
        <h3>Probar</h3>
        <div className="cfg-fila">
          <input type="email" value={para} onChange={(e) => setPara(e.target.value)} placeholder="tu-correo@ejemplo.com" style={{ flex: 1 }} />
          <button
            type="button"
            className="btn"
            disabled={ocupado || !para || cambiado}
            title={cambiado ? 'Guarda los cambios antes de probar' : undefined}
            onClick={() => void accion(() => pedir('/api/correo/probar', { method: 'POST', body: JSON.stringify({ para }) }), `Correo de prueba enviado a ${para}.`)}
          >
            {ocupado ? 'Enviando…' : 'Enviar prueba'}
          </button>
        </div>
      </section>

      <section className="cfg-grupo">
        <h3>Registro de comunicaciones</h3>
        {registro.length ? (
          <ul className="cfg-lista">
            {registro.map((r, i) => (
              <li key={i} className={r.ok === false ? 'error' : ''}>
                <b>
                  {r.canal === 'correo' ? '✉' : '✈'} {r.direccion === 'entrada' ? 'de' : 'a'} {r.para || r.persona || '—'}
                </b>
                <small>
                  {r.asunto ? `${r.asunto} · ` : ''}
                  {r.ok === false ? `falló: ${r.error}` : 'ok'} · {hace(r.fecha)}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cfg-nota">Todavía no se ha enviado nada.</p>
        )}
      </section>
    </form>
  );
}
