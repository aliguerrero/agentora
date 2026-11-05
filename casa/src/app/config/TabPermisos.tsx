import { useCallback, useEffect, useState } from 'react';
import { pedir } from './configApi';

type Nivel = 'no' | 'leer' | 'escribir' | 'todo';
type Git = 'no' | 'commits' | 'push';
interface Bloque {
  conexiones?: Record<string, Nivel>;
  git?: Git;
  contratar?: boolean;
  contactar?: boolean;
}
interface Datos {
  matriz: { perfiles: Record<string, Bloque>; agentes: Record<string, Bloque>; otorgan: Record<string, Nivel> };
  perfiles: string[];
  conexiones: { id: string; nombre: string; activa: boolean; conHerramientas: boolean }[];
  agentes: { id: string; nombre: string; proyecto: string; nivel: 'total' | 'basico'; perfil: string; efectivo: { conexiones: Record<string, Nivel>; git: Git; contratar: boolean; contactar: boolean; excepciones: string[] }; avisos: string[] }[];
}

const NIVEL: Record<Nivel, string> = { no: 'Sin acceso', leer: 'Leer', escribir: 'Leer y escribir', todo: 'Todo (incluye destructivo)' };
const GIT: Record<Git, string> = { no: 'Sin commits', commits: 'Commits, sin push', push: 'Commits y push' };

/** Matriz de permisos: perfiles × conexiones y capacidades, excepciones por agente y quién otorga. */
export function TabPermisos() {
  const [d, setD] = useState<Datos | null>(null);
  const [agente, setAgente] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const cargar = useCallback(async () => setD(await pedir<Datos>('/api/permisos')), []);
  useEffect(() => {
    cargar().catch((e: Error) => setAviso({ tipo: 'error', texto: e.message }));
  }, [cargar]);
  const guardar = async (cuerpo: object, ok: string) => {
    setAviso(null);
    try {
      await pedir('/api/permisos', { method: 'PUT', body: JSON.stringify(cuerpo) });
      setAviso({ tipo: 'ok', texto: ok });
      await cargar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    }
  };
  if (!d) return <p className="cfg-nota">{aviso?.texto || 'Cargando…'}</p>;
  const ag = d.agentes.find((a) => a.id === agente);

  const celdaNivel = (valor: Nivel, cambiar: (n: Nivel) => void, conHerramientas: boolean) => (
    <select value={valor} onChange={(e) => cambiar(e.target.value as Nivel)} title={conHerramientas ? undefined : 'Sin lista de herramientas: leer/escribir se aplican como instrucción'} className={`cfg-nivel n-${valor}`}>
      {(Object.keys(NIVEL) as Nivel[]).map((n) => (
        <option key={n} value={n}>
          {NIVEL[n]}
          {!conHerramientas && (n === 'leer' || n === 'escribir') ? ' *' : ''}
        </option>
      ))}
    </select>
  );

  return (
    <div className="cfg-form">
      {aviso && <p className={`cfg-aviso ${aviso.tipo}`}>{aviso.texto}</p>}
      <section className="cfg-grupo">
        <h3>Por perfil</h3>
        <p className="cfg-nota">
          Cada agente recibe lo de su perfil (backend, qa…). Se aplica de verdad: herramienta por herramienta en Claude y Codex cuando la conexión tiene su lista; con * se permite la conexión entera y el nivel va como instrucción. Los agentes de nivel básico nunca pasan de «Leer». Los vetos de la oficina siguen por encima.
        </p>
        <div className="cfg-tabla-envoltura">
          <table className="cfg-tabla">
            <thead>
              <tr>
                <th>Perfil</th>
                {d.conexiones.map((c) => (
                  <th key={c.id} className={c.activa ? '' : 'apagada'}>
                    {c.nombre}
                  </th>
                ))}
                <th>Git</th>
                <th>Contratar</th>
                <th>Contactar</th>
              </tr>
            </thead>
            <tbody>
              {d.perfiles.map((p) => {
                const b = d.matriz.perfiles[p] || {};
                return (
                  <tr key={p}>
                    <th>{p}</th>
                    {d.conexiones.map((c) => (
                      <td key={c.id}>{celdaNivel(b.conexiones?.[c.id] || 'no', (n) => void guardar({ perfil: p, bloque: { conexiones: { ...(b.conexiones || {}), [c.id]: n } } }, `${p}: ${c.nombre} → ${NIVEL[n]}.`), c.conHerramientas)}</td>
                    ))}
                    <td>
                      <select value={b.git || 'commits'} onChange={(e) => void guardar({ perfil: p, bloque: { git: e.target.value } }, `${p}: Git → ${GIT[e.target.value as Git]}.`)}>
                        {(Object.keys(GIT) as Git[]).map((g) => (
                          <option key={g} value={g}>
                            {GIT[g]}
                          </option>
                        ))}
                      </select>
                    </td>
                    {(['contratar', 'contactar'] as const).map((k) => (
                      <td key={k}>
                        <input type="checkbox" checked={b[k] !== false} onChange={(e) => void guardar({ perfil: p, bloque: { [k]: e.target.checked } }, `${p}: ${k} ${e.target.checked ? 'permitido' : 'quitado'}.`)} aria-label={`${p} puede ${k}`} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cfg-grupo">
        <h3>Excepciones por agente</h3>
        <select value={agente} onChange={(e) => setAgente(e.target.value)}>
          <option value="">Elige un agente…</option>
          {d.agentes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre} · {a.perfil} · {a.proyecto}
              {a.efectivo.excepciones.length ? ' · con excepciones' : ''}
            </option>
          ))}
        </select>
        {ag && (
          <div className="cfg-editor cfg-grupo">
            <p className="cfg-nota">
              Perfil «{ag.perfil}», nivel {ag.nivel === 'total' ? 'total' : 'básico (máximo «Leer»)'}. Lo que cambies aquí se aplica solo a {ag.nombre}, por encima de su perfil.
            </p>
            {ag.avisos.map((a) => (
              <p key={a} className="cfg-aviso error">
                {a}
              </p>
            ))}
            {d.conexiones.map((c) => (
              <label key={c.id} className="cfg-sala">
                <span>{c.nombre}</span>
                {celdaNivel(ag.efectivo.conexiones[c.id] || 'no', (n) => void guardar({ agente: ag.id, bloque: { conexiones: { ...(d.matriz.agentes[ag.id]?.conexiones || {}), [c.id]: n } } }, `${ag.nombre}: ${c.nombre} → ${NIVEL[n]}.`), c.conHerramientas)}
              </label>
            ))}
            <label className="cfg-sala">
              <span>Git</span>
              <select value={ag.efectivo.git} onChange={(e) => void guardar({ agente: ag.id, bloque: { git: e.target.value } }, `${ag.nombre}: Git → ${GIT[e.target.value as Git]}.`)}>
                {(Object.keys(GIT) as Git[]).map((g) => (
                  <option key={g} value={g}>
                    {GIT[g]}
                  </option>
                ))}
              </select>
            </label>
            {(['contratar', 'contactar'] as const).map((k) => (
              <label key={k} className="cfg-check">
                <input type="checkbox" checked={ag.efectivo[k]} onChange={(e) => void guardar({ agente: ag.id, bloque: { [k]: e.target.checked } }, `${ag.nombre}: ${k} ${e.target.checked ? 'permitido' : 'quitado'}.`)} /> Puede {k}
              </label>
            ))}
            {ag.efectivo.excepciones.length > 0 && (
              <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => void guardar({ agente: ag.id, bloque: null }, `${ag.nombre} vuelve a los permisos de su perfil.`)}>
                Quitar sus excepciones
              </button>
            )}
          </div>
        )}
      </section>

      <section className="cfg-grupo">
        <h3>Quién puede dar accesos a otros agentes</h3>
        <p className="cfg-nota">Con la solicitud acceso-*.json, hasta el nivel indicado y nunca por encima del suyo propio en esa conexión.</p>
        {[['gerente', 'El gerente de cada proyecto'], ...d.agentes.filter((a) => d.matriz.otorgan[a.id]).map((a) => [a.id, a.nombre])].map(([k, etiqueta]) => (
          <label key={k} className="cfg-sala">
            <span>{etiqueta}</span>
            <select value={d.matriz.otorgan[k] || 'no'} onChange={(e) => void guardar({ otorgan: { ...d.matriz.otorgan, [k]: e.target.value } }, 'Guardado.')}>
              {(Object.keys(NIVEL) as Nivel[]).map((n) => (
                <option key={n} value={n}>
                  {n === 'no' ? 'No puede otorgar' : `Hasta «${NIVEL[n]}»`}
                </option>
              ))}
            </select>
          </label>
        ))}
        <select
          value=""
          onChange={(e) => e.target.value && void guardar({ otorgan: { ...d.matriz.otorgan, [e.target.value]: 'leer' } }, 'Ahora también puede otorgar (hasta «Leer»).')}
        >
          <option value="">+ Permitir a otro agente otorgar accesos…</option>
          {d.agentes.filter((a) => !d.matriz.otorgan[a.id]).map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre} · {a.proyecto}
            </option>
          ))}
        </select>
      </section>
    </div>
  );
}
