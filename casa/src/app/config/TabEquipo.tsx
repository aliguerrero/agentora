import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { guardarSeccion, pedir } from './configApi';

interface Persona {
  id: string;
  nombre: string;
  cargo: string;
  correo: string;
  telegramUsuario: string;
  telefono: string;
  zonaHoraria: string;
  horario: string;
  canal: 'correo' | 'telegram' | 'ninguno';
  contacto: 'permitido' | 'pide-permiso' | 'no';
  compartirTelefono: boolean;
  proyectos: string[];
  jira: { accountId: string; nombre: string } | null;
  notas: string;
  telegramVinculado?: boolean;
}
interface Proyecto {
  id: string;
  nombre: string;
}
interface UsuarioJira {
  accountId: string;
  nombre: string;
  correo: string | null;
  activo: boolean;
  tareas: number;
  persona: { id: string; nombre: string; vinculada: boolean } | null;
}

const VACIA: Omit<Persona, 'id'> = {
  nombre: '', cargo: '', correo: '', telegramUsuario: '', telefono: '', zonaHoraria: '', horario: '',
  canal: 'correo', contacto: 'pide-permiso', compartirTelefono: false, proyectos: ['*'], jira: null, notas: '',
};
const CONTACTO = { permitido: 'Los agentes le escriben directamente', 'pide-permiso': 'Piden permiso antes de escribirle', no: 'No la contactan' };

function Editor({ inicial, proyectos, onGuardar, onCancelar }: { inicial: Omit<Persona, 'id'> & { id?: string }; proyectos: Proyecto[]; onGuardar: (p: Omit<Persona, 'id'>) => Promise<void>; onCancelar: () => void }) {
  const [p, setP] = useState(inicial);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const c = <K extends keyof Persona>(k: K, v: Persona[K]) => setP((x) => ({ ...x, [k]: v }));
  const todos = p.proyectos.includes('*');
  const alternar = (id: string) => {
    const actuales = todos ? [] : p.proyectos;
    const nuevos = actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id];
    c('proyectos', nuevos.length ? nuevos : ['*']);
  };
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await onGuardar(p);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };
  return (
    <form className="cfg-grupo cfg-editor" onSubmit={enviar}>
      <h3>{inicial.id ? `Editar a ${inicial.nombre}` : 'Nueva persona'}</h3>
      {error && <p className="cfg-aviso error">{error}</p>}
      <div className="cfg-fila">
        <label>
          Nombre
          <input value={p.nombre} maxLength={80} required onChange={(e) => c('nombre', e.target.value)} />
        </label>
        <label>
          Cargo
          <input value={p.cargo} maxLength={80} onChange={(e) => c('cargo', e.target.value)} placeholder="Contadora, QA, cliente…" />
        </label>
      </div>
      <div className="cfg-fila">
        <label>
          Correo
          <input type="email" value={p.correo} onChange={(e) => c('correo', e.target.value)} />
        </label>
        <label>
          Usuario de Telegram
          <input value={p.telegramUsuario} onChange={(e) => c('telegramUsuario', e.target.value)} placeholder="@usuario" />
        </label>
        <label>
          Teléfono
          <input value={p.telefono} onChange={(e) => c('telefono', e.target.value)} placeholder="+58 412 …" />
        </label>
      </div>
      <label className="cfg-check">
        <input type="checkbox" checked={p.compartirTelefono} onChange={(e) => c('compartirTelefono', e.target.checked)} /> Los agentes pueden ver su teléfono
      </label>
      <div className="cfg-fila">
        <label>
          Horario
          <input value={p.horario} maxLength={120} onChange={(e) => c('horario', e.target.value)} placeholder="L-V 8:00-17:00" />
        </label>
        <label>
          Zona horaria
          <input list="cfg-zonas-persona" value={p.zonaHoraria} onChange={(e) => c('zonaHoraria', e.target.value)} placeholder="America/Caracas" />
          <datalist id="cfg-zonas-persona">
            {((Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []).map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="cfg-fila">
        <label>
          Canal preferido
          <select value={p.canal} onChange={(e) => c('canal', e.target.value as Persona['canal'])}>
            <option value="correo">Correo</option>
            <option value="telegram">Telegram</option>
            <option value="ninguno">No contactar directamente</option>
          </select>
        </label>
        <label>
          Contacto de los agentes
          <select value={p.contacto} onChange={(e) => c('contacto', e.target.value as Persona['contacto'])}>
            {Object.entries(CONTACTO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="cfg-grupo">
        <span className="cfg-etiqueta">Proyectos</span>
        <div className="cfg-chips">
          <button type="button" className="cfg-chipbtn" aria-pressed={todos} onClick={() => c('proyectos', ['*'])}>
            Todos
          </button>
          {proyectos.map((pr) => (
            <button key={pr.id} type="button" className="cfg-chipbtn" aria-pressed={!todos && p.proyectos.includes(pr.id)} onClick={() => alternar(pr.id)}>
              {pr.nombre}
            </button>
          ))}
        </div>
      </div>
      <div className="cfg-fila">
        <label>
          Nombre en Jira
          <input value={p.jira?.nombre ?? ''} onChange={(e) => c('jira', { accountId: p.jira?.accountId ?? '', nombre: e.target.value })} />
        </label>
        <label>
          Cuenta de Jira (accountId)
          <input value={p.jira?.accountId ?? ''} onChange={(e) => c('jira', { nombre: p.jira?.nombre ?? '', accountId: e.target.value.trim() })} spellCheck={false} />
        </label>
      </div>
      <label>
        Notas útiles para los agentes
        <textarea rows={2} maxLength={500} value={p.notas} onChange={(e) => c('notas', e.target.value)} placeholder="Aprueba las facturas; responde mejor por la mañana…" />
      </label>
      <div className="cfg-acciones">
        <button type="button" className="btn" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="submit" className="btn principal" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

function Jira({ proyectos, onImportado }: { proyectos: Proyecto[]; onImportado: () => void }) {
  const [cfg, setCfg] = useState<{ sitio: string; correo: string; proyectos: Record<string, string> } | null>(null);
  const [token, setToken] = useState<{ pista: string } | null>(null);
  const [nuevoToken, setNuevoToken] = useState('');
  const [proyecto, setProyecto] = useState(proyectos[0]?.id ?? '');
  const [usuarios, setUsuarios] = useState<UsuarioJira[] | null>(null);
  const [elegidos, setElegidos] = useState<Record<string, boolean>>({});
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const d = await pedir<{ config: { sitio: string; correo: string; proyectos: Record<string, string> }; token: { pista: string } | null }>('/api/jira');
    setCfg(d.config);
    setToken(d.token);
  }, []);
  useEffect(() => {
    cargar().catch((e: Error) => setAviso({ tipo: 'error', texto: e.message }));
  }, [cargar]);
  const accion = async (fn: () => Promise<unknown>, ok?: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await fn();
      if (ok) setAviso({ tipo: 'ok', texto: ok });
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  };
  if (!cfg) return <p className="cfg-nota">{aviso?.texto || 'Cargando Jira…'}</p>;

  const buscar = () =>
    accion(async () => {
      const d = await pedir<{ usuarios: UsuarioJira[] }>(`/api/jira/personas?proyecto=${encodeURIComponent(proyecto)}`);
      setUsuarios(d.usuarios);
      // Por defecto: vincular los que coinciden y aún no están vinculados; crear los activos sin ficha.
      setElegidos(Object.fromEntries(d.usuarios.map((u) => [u.accountId, u.persona ? !u.persona.vinculada : u.activo])));
    });
  const importar = () =>
    accion(async () => {
      const lista = (usuarios ?? []).filter((u) => elegidos[u.accountId] && !(u.persona?.vinculada)).map((u) => ({ accountId: u.accountId, nombre: u.nombre, correo: u.correo, accion: u.persona ? 'vincular' : 'crear', persona: u.persona?.id }));
      const r = await pedir<{ hechas: number }>('/api/jira/importar', { method: 'POST', body: JSON.stringify({ proyecto, lista }) });
      setUsuarios(null);
      onImportado();
      setAviso({ tipo: 'ok', texto: `${r.hechas} ${r.hechas === 1 ? 'persona actualizada' : 'personas actualizadas'} desde Jira.` });
    });

  return (
    <section className="cfg-grupo">
      <h3>Jira</h3>
      <p className="cfg-nota">Jira Cloud, solo lectura: quién puede tener tareas en cada proyecto y quién las tuvo en los últimos 90 días. Nada se guarda hasta que lo confirmes.</p>
      {aviso && <p className={`cfg-aviso ${aviso.tipo}`}>{aviso.texto}</p>}
      <div className="cfg-fila">
        <label>
          Sitio
          <input value={cfg.sitio} onChange={(e) => setCfg({ ...cfg, sitio: e.target.value.trim() })} placeholder="https://tuempresa.atlassian.net" spellCheck={false} />
        </label>
        <label>
          Tu correo de Atlassian
          <input type="email" value={cfg.correo} onChange={(e) => setCfg({ ...cfg, correo: e.target.value.trim() })} />
        </label>
      </div>
      <div className="cfg-fila">
        {proyectos.map((pr) => (
          <label key={pr.id} className="cfg-corto2">
            Clave de «{pr.nombre}»
            <input value={cfg.proyectos[pr.id] ?? ''} maxLength={20} placeholder="KAN" onChange={(e) => {
              const v = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
              const mapa = { ...cfg.proyectos };
              if (v) mapa[pr.id] = v;
              else delete mapa[pr.id];
              setCfg({ ...cfg, proyectos: mapa });
            }} />
          </label>
        ))}
      </div>
      <div className="cfg-fila">
        <button type="button" className="btn principal" disabled={ocupado} onClick={() => void accion(() => guardarSeccion('jira', cfg), 'Datos de Jira guardados.')}>
          Guardar
        </button>
        <input type="password" value={nuevoToken} onChange={(e) => setNuevoToken(e.target.value)} placeholder={token ? `Token guardado ${token.pista}` : 'Token de API de Atlassian'} autoComplete="new-password" style={{ flex: 1 }} />
        <button
          type="button"
          className="btn"
          disabled={ocupado || !nuevoToken}
          onClick={() =>
            void accion(async () => {
              await pedir('/api/config/secretos/JIRA_API_TOKEN', { method: 'PUT', body: JSON.stringify({ valor: nuevoToken }) });
              setNuevoToken('');
              await cargar();
            }, 'Token guardado cifrado.')
          }
        >
          Guardar token
        </button>
        <button type="button" className="btn" disabled={ocupado} onClick={() => void accion(async () => { const r = await pedir<{ cuenta: { nombre: string } }>('/api/jira/probar', { method: 'POST' }); setAviso({ tipo: 'ok', texto: `Conectado como ${r.cuenta.nombre}.` }); })}>
          Probar
        </button>
      </div>
      <p className="cfg-nota">Crea el token en id.atlassian.com › Seguridad › Tokens de API. Se guarda cifrado y no lo ven los agentes.</p>
      <div className="cfg-fila">
        <select value={proyecto} onChange={(e) => setProyecto(e.target.value)} style={{ flex: 1 }}>
          {proyectos.map((pr) => (
            <option key={pr.id} value={pr.id}>
              {pr.nombre} {cfg.proyectos[pr.id] ? `(${cfg.proyectos[pr.id]})` : '(sin clave)'}
            </option>
          ))}
        </select>
        <button type="button" className="btn principal" disabled={ocupado || !cfg.proyectos[proyecto]} onClick={() => void buscar()}>
          {ocupado ? 'Consultando…' : 'Buscar personas en Jira'}
        </button>
      </div>
      {usuarios && (
        <>
          <ul className="cfg-lista">
            {usuarios.map((u) => (
              <li key={u.accountId} className="cfg-jira">
                <label className="cfg-check">
                  <input type="checkbox" disabled={!!u.persona?.vinculada} checked={!!elegidos[u.accountId] && !u.persona?.vinculada} onChange={(e) => setElegidos({ ...elegidos, [u.accountId]: e.target.checked })} />
                  <span>
                    <b>{u.nombre}</b> {u.activo ? <span className="cfg-chip disponible">{u.tareas} tareas en 90 días</span> : <span className="cfg-chip">sin tareas recientes</span>}
                    <small>
                      {u.correo ?? 'correo oculto en Jira'} ·{' '}
                      {u.persona ? (u.persona.vinculada ? `ya vinculada con ${u.persona.nombre}` : `vincular con ${u.persona.nombre}`) : 'crear ficha nueva'}
                    </small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {!usuarios.length && <p className="cfg-nota">Jira no devolvió personas para ese proyecto.</p>}
          <div className="cfg-acciones">
            <button type="button" className="btn" onClick={() => setUsuarios(null)}>
              Descartar
            </button>
            <button type="button" className="btn principal" disabled={ocupado || !Object.values(elegidos).some(Boolean)} onClick={() => void importar()}>
              Confirmar e importar
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** Directorio del equipo humano: fichas, invitación por Telegram y sincronización con Jira. */
export function TabEquipo() {
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [bot, setBot] = useState<{ usuario: string } | null>(null);
  const [editando, setEditando] = useState<(Omit<Persona, 'id'> & { id?: string }) | null>(null);
  const [invitacion, setInvitacion] = useState<{ persona: string; codigo: string; enlace: string | null; vence: string } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const d = await pedir<{ personas: Persona[]; proyectos: Proyecto[]; bot: { usuario: string } | null }>('/api/personas');
    setPersonas(d.personas);
    setProyectos(d.proyectos);
    setBot(d.bot);
  }, []);
  useEffect(() => {
    cargar().catch((e: Error) => setAviso({ tipo: 'error', texto: e.message }));
  }, [cargar]);
  const nombreProyecto = useMemo(() => Object.fromEntries(proyectos.map((p) => [p.id, p.nombre])), [proyectos]);

  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setAviso(null);
    try {
      await fn();
      setAviso({ tipo: 'ok', texto: ok });
      await cargar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    }
  };

  if (!personas) return <p className="cfg-nota">{aviso?.texto || 'Cargando…'}</p>;

  if (editando) {
    return (
      <div className="cfg-form">
        <Editor
          inicial={editando}
          proyectos={proyectos}
          onCancelar={() => setEditando(null)}
          onGuardar={async (p) => {
            await pedir(editando.id ? `/api/personas/${editando.id}` : '/api/personas', { method: editando.id ? 'PUT' : 'POST', body: JSON.stringify(p) });
            setEditando(null);
            setAviso({ tipo: 'ok', texto: `${p.nombre} guardado.` });
            await cargar();
          }}
        />
      </div>
    );
  }

  return (
    <div className="cfg-form">
      {aviso && <p className={`cfg-aviso ${aviso.tipo}`}>{aviso.texto}</p>}
      <section className="cfg-grupo">
        <div className="cfg-cuentas-cab">
          <h3>Personas ({personas.length})</h3>
          <button type="button" className="btn principal" onClick={() => setEditando({ ...VACIA })}>
            + Añadir persona
          </button>
        </div>
        <p className="cfg-nota">Los agentes de cada proyecto leen un resumen (EQUIPO.md) para saber a quién pedir qué; nunca ven teléfonos que no autorices.</p>
        {!personas.length && <p className="cfg-nota">Todavía no hay nadie. Añade a tu equipo o impórtalo desde Jira (abajo).</p>}
        <ul className="cfg-lista">
          {personas.map((p) => (
            <li key={p.id} className="cfg-persona">
              <div>
                <b>
                  {p.nombre}
                  {p.cargo && <span className="cfg-tenue"> · {p.cargo}</span>}
                </b>
                <small>
                  {p.proyectos.includes('*') ? 'Todos los proyectos' : p.proyectos.map((x) => nombreProyecto[x] ?? x).join(', ')}
                  {p.correo && ` · ${p.correo}`}
                  {p.jira?.nombre && ` · Jira: ${p.jira.nombre}`}
                </small>
                <span className="cfg-chips">
                  <span className={`cfg-chip ${p.telegramVinculado ? 'disponible' : ''}`}>{p.telegramVinculado ? 'Telegram vinculado' : 'Telegram sin vincular'}</span>
                  <span className={`cfg-chip ${p.contacto === 'permitido' ? 'disponible' : p.contacto === 'no' ? 'limite' : 'reserva'}`}>{CONTACTO[p.contacto]}</span>
                </span>
                {invitacion?.persona === p.id && (
                  <div className="cfg-invitacion">
                    <span>
                      Envíale este enlace o que abra {bot ? <b>@{bot.usuario}</b> : 'el bot'} y escriba <code>/start {invitacion.codigo}</code>. Vale una vez, hasta el {new Date(invitacion.vence).toLocaleDateString()}.
                    </span>
                    {invitacion.enlace && (
                      <button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(invitacion.enlace!).then(() => setAviso({ tipo: 'ok', texto: 'Enlace copiado.' }))}>
                        Copiar enlace
                      </button>
                    )}
                  </div>
                )}
              </div>
              <span className="cfg-persona-acciones">
                <button type="button" className="btn" onClick={() => setEditando(p)}>
                  Editar
                </button>
                {p.telegramVinculado ? (
                  <button type="button" className="btn" onClick={() => confirm(`¿Desvincular el Telegram de ${p.nombre}?`) && void accion(() => pedir(`/api/personas/${p.id}/telegram`, { method: 'DELETE' }), 'Telegram desvinculado.')}>
                    Desvincular
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      void accion(async () => {
                        const r = await pedir<{ codigo: string; enlace: string | null; vence: string }>(`/api/personas/${p.id}/telegram`, { method: 'POST' });
                        setInvitacion({ persona: p.id, ...r });
                      }, `Invitación para ${p.nombre} lista.`)
                    }
                  >
                    Invitar por Telegram
                  </button>
                )}
                <button type="button" className="btn" onClick={() => confirm(`¿Quitar a ${p.nombre} del directorio?`) && void accion(() => pedir(`/api/personas/${p.id}`, { method: 'DELETE' }), `${p.nombre} quitado.`)}>
                  Quitar
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <Jira proyectos={proyectos} onImportado={() => void cargar()} />
    </div>
  );
}
