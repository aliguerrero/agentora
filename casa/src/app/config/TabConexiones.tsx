import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { hace, pedir } from './configApi';

interface Herramienta {
  nombre: string;
  tipo: 'lectura' | 'escritura' | 'destructiva';
}
interface Conexion {
  id: string;
  nombre: string;
  tipo: 'http' | 'stdio';
  url?: string;
  comando?: string;
  args?: string[];
  auth: 'oauth' | 'token' | 'entorno' | 'ninguna';
  secreto?: string;
  entorno?: Record<string, string>;
  activa: boolean;
  proyectos: string[];
  plantilla?: string;
  verificado?: boolean;
  herramientas: Herramienta[];
  ultimaPrueba?: { fecha: string; ok: boolean; requiereSesion: boolean; servidor: string | null };
}
interface Plantilla extends Partial<Conexion> {
  plantilla: string;
  nota: string;
}
interface Datos {
  catalogo: Plantilla[];
  conexiones: Conexion[];
  secretos: Record<string, { pista: string }>;
  claude: { fecha: string | null; servidores: { nombre: string; url: string; conectado: boolean; estado: string }[]; error: string | null };
  proyectos: { id: string; nombre: string }[];
}

const AUTH = { oauth: 'Inicio de sesión (OAuth)', token: 'Token', entorno: 'Variables con secretos', ninguna: 'Sin autenticación' };

function Editor({ inicial, datos, nota, onGuardado, onCancelar }: { inicial: Partial<Conexion>; datos: Datos; nota?: string; onGuardado: () => void; onCancelar: () => void }) {
  const [c, setC] = useState<Partial<Conexion>>({ activa: true, proyectos: ['*'], auth: 'ninguna', tipo: 'http', ...inicial });
  const [argsTexto, setArgsTexto] = useState((inicial.args || []).join('\n'));
  const [valores, setValores] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const nombresSecretos = c.auth === 'token' && c.secreto ? [c.secreto] : Object.values(c.entorno || {});
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      for (const [nombre, valor] of Object.entries(valores)) if (valor) await pedir(`/api/config/secretos/${nombre}`, { method: 'PUT', body: JSON.stringify({ valor }) });
      await pedir(`/api/conexiones/${c.id}`, { method: 'PUT', body: JSON.stringify({ ...c, args: argsTexto.split('\n').map((x) => x.trim()).filter(Boolean) }) });
      onGuardado();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form className="cfg-grupo cfg-editor" onSubmit={guardar}>
      <h3>{inicial.id && datos.conexiones.some((x) => x.id === inicial.id) ? `Editar ${inicial.nombre}` : `Nueva conexión: ${c.nombre || ''}`}</h3>
      {nota && <p className="cfg-nota">{nota}</p>}
      {c.verificado === false && <p className="cfg-aviso error">Servidor comunitario o de referencia: revisa el paquete antes de activarlo; se ejecuta en este equipo con tus credenciales.</p>}
      {error && <p className="cfg-aviso error">{error}</p>}
      <div className="cfg-fila">
        <label className="cfg-corto2">
          Id (para los agentes)
          <input value={c.id || ''} onChange={(e) => setC({ ...c, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} required maxLength={31} />
        </label>
        <label>
          Nombre
          <input value={c.nombre || ''} onChange={(e) => setC({ ...c, nombre: e.target.value })} required maxLength={60} />
        </label>
      </div>
      {c.tipo === 'http' ? (
        <label>
          URL del servidor MCP
          <input value={c.url || ''} onChange={(e) => setC({ ...c, url: e.target.value.trim() })} placeholder="https://…/mcp" spellCheck={false} required />
        </label>
      ) : (
        <div className="cfg-fila">
          <label className="cfg-corto2">
            Programa
            <input value={c.comando || ''} onChange={(e) => setC({ ...c, comando: e.target.value })} placeholder="npx" required />
          </label>
          <label>
            Argumentos (uno por línea)
            <textarea rows={2} value={argsTexto} onChange={(e) => setArgsTexto(e.target.value)} spellCheck={false} />
          </label>
        </div>
      )}
      <label>
        Autenticación
        <select value={c.auth} onChange={(e) => setC({ ...c, auth: e.target.value as Conexion['auth'] })}>
          {Object.entries(AUTH).map(([k, v]) => (
            <option key={k} value={k} disabled={k === 'entorno' && c.tipo === 'http'}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {c.auth === 'oauth' && (
        <p className="cfg-nota">
          Inicia sesión una vez en cada motor: en Claude, <code>claude mcp add --transport http {c.id || '<id>'} {c.url || '<url>'}</code> y luego <code>/mcp</code>; en Codex, <code>codex mcp login {c.id || '<id>'}</code>.
        </p>
      )}
      {c.auth === 'token' && (
        <label>
          Nombre del secreto con el token
          <input value={c.secreto || ''} onChange={(e) => setC({ ...c, secreto: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} placeholder="GITHUB_MCP_TOKEN" required />
        </label>
      )}
      {c.auth === 'entorno' && (
        <label>
          Variables (VARIABLE=SECRETO, una por línea)
          <textarea
            rows={2}
            spellCheck={false}
            value={Object.entries(c.entorno || {}).map(([k, v]) => `${k}=${v}`).join('\n')}
            onChange={(e) => setC({ ...c, entorno: Object.fromEntries(e.target.value.split('\n').map((l) => l.split('=').map((x) => x.trim().toUpperCase())).filter((p) => p[0] && p[1])) })}
          />
        </label>
      )}
      {nombresSecretos.map((n) => (
        <label key={n}>
          Valor de {n} {datos.secretos[n] ? `(guardado ${datos.secretos[n].pista}; déjalo vacío para no cambiarlo)` : '(sin guardar)'}
          <input type="password" autoComplete="new-password" value={valores[n] || ''} onChange={(e) => setValores({ ...valores, [n]: e.target.value })} />
        </label>
      ))}
      <div className="cfg-grupo">
        <span className="cfg-etiqueta">Proyectos que la usan</span>
        <div className="cfg-chips">
          <button type="button" className="cfg-chipbtn" aria-pressed={c.proyectos?.includes('*')} onClick={() => setC({ ...c, proyectos: ['*'] })}>
            Todos
          </button>
          {datos.proyectos.map((p) => (
            <button
              key={p.id}
              type="button"
              className="cfg-chipbtn"
              aria-pressed={!c.proyectos?.includes('*') && c.proyectos?.includes(p.id)}
              onClick={() => {
                const actuales = (c.proyectos || []).filter((x) => x !== '*');
                const nuevos = actuales.includes(p.id) ? actuales.filter((x) => x !== p.id) : [...actuales, p.id];
                setC({ ...c, proyectos: nuevos.length ? nuevos : ['*'] });
              }}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      </div>
      <div className="cfg-acciones">
        <button type="button" className="btn" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="submit" className="btn principal">
          Guardar
        </button>
      </div>
    </form>
  );
}

/** Conexiones MCP: catálogo, alta, secretos, prueba (descubre herramientas) y estado en Claude. */
export function TabConexiones() {
  const [d, setD] = useState<Datos | null>(null);
  const [editando, setEditando] = useState<{ c: Partial<Conexion>; nota?: string } | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [probando, setProbando] = useState<string | null>(null);

  const cargar = useCallback(async () => setD(await pedir<Datos>('/api/conexiones')), []);
  useEffect(() => {
    cargar().catch((e: Error) => setAviso({ tipo: 'error', texto: e.message }));
  }, [cargar]);

  if (!d) return <p className="cfg-nota">{aviso?.texto || 'Cargando…'}</p>;
  if (editando) {
    return (
      <div className="cfg-form">
        <Editor
          inicial={editando.c}
          nota={editando.nota}
          datos={d}
          onCancelar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            setAviso({ tipo: 'ok', texto: 'Conexión guardada. Pruébala para descubrir sus herramientas y asígnala en Permisos.' });
            void cargar();
          }}
        />
      </div>
    );
  }
  const enClaude = (id: string) => d.claude.servidores.find((s) => s.nombre === id);

  return (
    <div className="cfg-form">
      {aviso && <p className={`cfg-aviso ${aviso.tipo}`}>{aviso.texto}</p>}
      <section className="cfg-grupo">
        <h3>Conexiones de la oficina</h3>
        <p className="cfg-nota">Lo que cada agente puede hacer con ellas se decide en la pestaña Permisos. Los tokens se guardan cifrados y llegan al motor solo como variables de entorno.</p>
        <ul className="cfg-lista">
          {d.conexiones.map((c) => {
            const claude = enClaude(c.id);
            const cuenta = { lectura: 0, escritura: 0, destructiva: 0 };
            for (const h of c.herramientas) cuenta[h.tipo]++;
            return (
              <li key={c.id} className="cfg-persona">
                <div>
                  <b>
                    {c.nombre} <span className="cfg-tenue">· {c.id}</span>
                  </b>
                  <small>
                    {c.tipo === 'http' ? c.url : `${c.comando} ${(c.args || []).join(' ')}`} · {AUTH[c.auth]}
                  </small>
                  <span className="cfg-chips">
                    <span className={`cfg-chip ${c.activa ? 'disponible' : ''}`}>{c.activa ? 'Activa' : 'Desactivada'}</span>
                    {c.herramientas.length ? (
                      <button type="button" className="cfg-chipbtn" onClick={() => setAbierta(abierta === c.id ? null : c.id)}>
                        {c.herramientas.length} herramientas ({cuenta.lectura} lectura · {cuenta.escritura} escritura · {cuenta.destructiva} destructivas)
                      </button>
                    ) : (
                      <span className="cfg-chip reserva">Sin lista de herramientas: pruébala</span>
                    )}
                    {c.auth === 'oauth' && <span className={`cfg-chip ${claude?.conectado ? 'disponible' : 'limite'}`}>{claude ? (claude.conectado ? 'Claude: conectada' : `Claude: ${claude.estado}`) : 'Claude: no configurada'}</span>}
                    {c.ultimaPrueba && <span className="cfg-chip">{c.ultimaPrueba.requiereSesion ? 'pide iniciar sesión' : 'probada'} {hace(c.ultimaPrueba.fecha)}</span>}
                  </span>
                  {abierta === c.id && (
                    <div className="cfg-herramientas">
                      {c.herramientas.map((h) => (
                        <span key={h.nombre} className={`cfg-chip ${h.tipo === 'lectura' ? 'disponible' : h.tipo === 'destructiva' ? 'limite' : 'reserva'}`}>
                          {h.nombre}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="cfg-persona-acciones">
                  <button
                    type="button"
                    className="btn"
                    disabled={probando === c.id}
                    onClick={async () => {
                      setProbando(c.id);
                      setAviso(null);
                      try {
                        const r = await pedir<{ requiereSesion?: boolean; herramientas: Herramienta[]; detalle?: string }>(`/api/conexiones/${c.id}/probar`, { method: 'POST' });
                        setAviso({ tipo: 'ok', texto: r.requiereSesion ? `${c.nombre} responde; ${r.detalle}` : `${c.nombre} funciona: ${r.herramientas.length} herramientas.` });
                        await cargar();
                      } catch (e) {
                        setAviso({ tipo: 'error', texto: `${c.nombre}: ${(e as Error).message}` });
                      } finally {
                        setProbando(null);
                      }
                    }}
                  >
                    {probando === c.id ? 'Probando…' : 'Probar'}
                  </button>
                  <button type="button" className="btn" onClick={() => setEditando({ c })}>
                    Editar
                  </button>
                  <button type="button" className="btn" onClick={async () => { await pedir(`/api/conexiones/${c.id}`, { method: 'PUT', body: JSON.stringify({ ...c, activa: !c.activa }) }); void cargar(); }}>
                    {c.activa ? 'Desactivar' : 'Activar'}
                  </button>
                  <button type="button" className="btn" onClick={() => confirm(`¿Quitar la conexión ${c.nombre}?`) && void pedir(`/api/conexiones/${c.id}`, { method: 'DELETE' }).then(cargar)}>
                    Quitar
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="cfg-grupo">
        <h3>Añadir una conexión</h3>
        <div className="cfg-catalogo">
          {d.catalogo.map((p) => (
            <button
              key={p.plantilla}
              type="button"
              className="cfg-opcion"
              onClick={() => {
                const { nota, ...resto } = p;
                const libre = d.conexiones.some((x) => x.id === p.plantilla) ? `${p.plantilla}2` : ['http', 'stdio'].includes(p.plantilla) ? '' : p.plantilla;
                setEditando({ c: { ...resto, id: libre, nombre: ['http', 'stdio'].includes(p.plantilla) ? '' : p.nombre }, nota });
              }}
            >
              <b>
                {p.nombre} {p.verificado || ['http', 'stdio'].includes(p.plantilla) ? '' : <span className="cfg-chip reserva">comunitario</span>}
              </b>
              <span>{p.nota}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="cfg-grupo">
        <h3>Conexiones de Claude en este equipo</h3>
        <p className="cfg-nota">
          {d.claude.fecha ? `Revisado ${hace(d.claude.fecha)}: ` : 'Revisando… '}
          {d.claude.servidores.map((s) => `${s.nombre} (${s.conectado ? 'conectada' : s.estado})`).join(', ') || d.claude.error || 'ninguna'}
        </p>
        <button type="button" className="btn" style={{ alignSelf: 'flex-start', flex: 'none' }} onClick={async () => { await pedir('/api/conexiones/claude', { method: 'POST' }); setTimeout(() => void cargar(), 20000); setAviso({ tipo: 'ok', texto: 'Revisando las conexiones de Claude (tarda unos segundos)…' }); }}>
          Revisar otra vez
        </button>
      </section>
    </div>
  );
}
