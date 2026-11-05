import { useEffect, useRef, useState } from 'react';
import type { Casa, ConfigCasa } from '../api';
import { pedir } from './configApi';

interface Opcion {
  id: string;
  nombre: string;
}

interface Obra {
  id: string;
  sitio: string;
  nombre: string;
  departamento: string | null;
  tamano: string;
  puestos: number;
  estilo: string;
  muro: string;
  estado: string;
  pedidaPor?: string;
  razon?: string;
  inicio?: number;
  fin?: number;
}

interface Pedido {
  id: string;
  nombreDepartamento: string | null;
  personas: number;
  necesidades: string;
  estado: 'en-cola' | 'redactando' | 'fallido';
  intentos: number;
  motivos: string[];
  espera: string | null;
}

interface Datos {
  obras: Obra[];
  pedidos?: Pedido[];
  catalogo: {
    sitios: (Opcion & { sala: string })[];
    tamanos: (Opcion & { puestos: number; ancho: number })[];
    estilos: Opcion[];
    muros: Opcion[];
    maxSalas: number;
  };
  deshacer: string | null;
  obra?: Obra;
}

interface Props {
  casa: Casa;
  onGuardado: (c: ConfigCasa) => void;
}

const VACIO = { sitio: '', nombre: '', departamento: '', tamano: 'M', puestos: 6, estilo: 'oficina', muro: 'ninguno' };
const PEDIDO_VACIO = { departamento: '', personas: 4, necesidades: '' };
/** Mientras el panel está abierto: el ingeniero y las obras avanzan solos. */
const REFRESCO_MS = 4000;
const enviar = (ruta: string, cuerpo: object = {}) => pedir<Datos>(ruta, { method: 'POST', body: JSON.stringify(cuerpo) });
const ocupantesDe = (e: unknown): string[] => (e as { datos?: { ocupantes?: string[] } }).datos?.ocupantes ?? [];

/** Salas nuevas en las alas de la casa: el titular las ordena aquí o se las pide al ingeniero. */
export function SeccionObras({ casa, onGuardado }: Props) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [f, setF] = useState(VACIO);
  const [pedido, setPedido] = useState(PEDIDO_VACIO);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  // La sala tiene departamentos: falta confirmar que pasen al atrio antes de repetir la acción.
  const [duda, setDuda] = useState<{ seguir: () => void; quienes: string[] } | null>(null);

  const refrescar = () => casa.config && onGuardado(casa.config);

  const hechas = useRef<number | null>(null);
  const alRefrescar = useRef(refrescar);
  alRefrescar.current = refrescar;
  useEffect(() => {
    const traer = () =>
      pedir<Datos>('/api/obras')
        .then((d) => {
          setDatos(d);
          // Una obra acaba de terminar: la casa tiene que enterarse ya.
          const n = d.obras.filter((o) => o.estado === 'terminada').length;
          if (hechas.current !== null && hechas.current !== n) alRefrescar.current();
          hechas.current = n;
        })
        .catch((e: Error) => setError(e.message));
    void traer();
    const t = setInterval(() => void traer(), REFRESCO_MS);
    return () => clearInterval(t);
  }, []);

  const ejecutar = async (accion: () => Promise<void>, reubicando?: () => void) => {
    setOcupado(true);
    setError('');
    setDuda(null);
    try {
      await accion();
    } catch (e) {
      const quienes = ocupantesDe(e);
      if (quienes.length && reubicando) setDuda({ seguir: reubicando, quienes });
      else setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  if (!datos) {
    return (
      <section className="cfg-grupo">
        <h3>Construir salas</h3>
        <p className={error ? 'cfg-aviso error' : 'cfg-nota'}>{error || 'Cargando…'}</p>
      </section>
    );
  }

  const { catalogo } = datos;
  const nombreSitio = (id: string) => catalogo.sitios.find((s) => s.id === id)?.nombre ?? id;
  const vivas = datos.obras.filter((o) => o.estado === 'terminada');
  const propuestas = datos.obras.filter((o) => o.estado === 'propuesta');
  const enObra = datos.obras.filter((o) => o.estado === 'en-construccion');
  const pedidos = datos.pedidos ?? [];
  const libres = catalogo.sitios.filter((s) => ![...vivas, ...enObra].some((o) => o.sitio === s.id));
  const sitio = libres.some((s) => s.id === f.sitio) ? f.sitio : (libres[0]?.id ?? '');
  const maximo = catalogo.tamanos.find((t) => t.id === f.tamano)?.puestos ?? 1;
  const puestos = Math.min(f.puestos, maximo);

  /** Aprueba y empieza la obra. Al terminar, el servidor lleva al departamento a su sala. */
  const construir = async (obra: Obra) => {
    setDatos(await enviar(`/api/obras/${obra.id}/aprobar`));
    refrescar();
  };

  const alPedir = () =>
    ejecutar(async () => {
      setDatos(await enviar('/api/obras/pedidos', { departamento: pedido.departamento || null, personas: pedido.personas, necesidades: pedido.necesidades }));
      setPedido(PEDIDO_VACIO);
    });

  const alConstruir = () =>
    ejecutar(async () => {
      const r = await enviar('/api/obras', { ...f, sitio, puestos, departamento: f.departamento || null });
      setDatos(r);
      if (r.obra) await construir(r.obra);
      setF({ ...VACIO, tamano: f.tamano, estilo: f.estilo });
    });

  const demoler = (o: Obra, reubicar = false): Promise<void> =>
    ejecutar(
      async () => {
        setDatos(await enviar(`/api/obras/${o.id}/demoler`, { reubicar }));
        refrescar();
      },
      () => void demoler(o, true),
    );
  const deshacer = (reubicar = false): Promise<void> =>
    ejecutar(
      async () => {
        setDatos(await enviar('/api/obras/deshacer', { reubicar }));
        refrescar();
      },
      () => void deshacer(true),
    );

  return (
    <section className="cfg-grupo">
      <h3>Construir salas</h3>
      <p className="cfg-nota">
        Hasta {catalogo.maxSalas} salas nuevas en las alas este y oeste, con los materiales de la casa. Una obra tarda un minuto y el departamento se muda al terminar. Si no eliges departamento, nadie cambia de sala por eso, salvo quien estaba en el atrio sin sala: pasa a la nueva.
      </p>

      {pedidos.length > 0 && (
        <ul className="cfg-lista cfg-obras" aria-label="Pedidos al ingeniero">
          {pedidos.map((p) => (
            <li key={p.id}>
              <span>
                <b>Ingeniero: {p.nombreDepartamento ?? 'sala sin departamento'}</b>
                <small>
                  {p.estado === 'redactando' ? `Redactando el plano (intento ${p.intentos + 1} de 3)…` : p.estado === 'fallido' ? `Sin plano tras ${p.intentos} intentos` : p.intentos ? `Corrigiendo el plano (${p.intentos} de 3)` : 'En cola'}
                  {p.espera ? ` · ${p.espera}` : ''}
                </small>
                {p.motivos.length > 0 && <small className="motivo">{p.motivos.join(' ')}</small>}
              </span>
              <button type="button" className="btn" disabled={ocupado} onClick={() => void ejecutar(async () => setDatos(await enviar(`/api/obras/pedidos/${p.id}/cancelar`)))}>
                {p.estado === 'fallido' ? 'Quitar' : 'Cancelar'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {vivas.length + propuestas.length + enObra.length > 0 && (
        <ul className="cfg-lista cfg-obras">
          {[...propuestas, ...enObra, ...vivas].map((o) => (
            <li key={o.id}>
              <span style={o.estado === 'en-construccion' ? { flex: 1 } : undefined}>
                <b>{o.nombre}</b>
                <small>
                  {nombreSitio(o.sitio)} · {catalogo.tamanos.find((t) => t.id === o.tamano)?.nombre} · {o.puestos} {o.puestos === 1 ? 'puesto' : 'puestos'}
                  {o.departamento ? ` · ${casa.deptos.find((d) => d.id === o.departamento)?.nombre ?? o.departamento}` : ''}
                </small>
                {o.estado === 'propuesta' && o.pedidaPor === 'ingeniero' && <small>Plano del ingeniero{o.razon ? `: ${o.razon}` : ''}</small>}
                {o.estado === 'en-construccion' && o.inicio && o.fin && (
                  <progress max={o.fin - o.inicio} value={Math.min(o.fin - o.inicio, Math.max(0, Date.now() - o.inicio))} aria-label={`Avance de ${o.nombre}`} />
                )}
              </span>
              {o.estado === 'en-construccion' ? null : o.estado === 'propuesta' ? (
                <span className="cfg-obras-acciones">
                  <button type="button" className="btn" disabled={ocupado || !libres.some((s) => s.id === o.sitio)} onClick={() => void ejecutar(() => construir(o))}>
                    Aprobar y construir
                  </button>
                  <button type="button" className="btn" disabled={ocupado} onClick={() => void ejecutar(async () => setDatos(await enviar(`/api/obras/${o.id}/rechazar`)))}>
                    Rechazar
                  </button>
                </span>
              ) : (
                <button type="button" className="btn" disabled={ocupado} onClick={() => void demoler(o)}>
                  Demoler
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {duda && (
        <div className="elegir-depto-duda" role="group" aria-label="La sala tiene departamentos">
          <span>Están en esa sala: {duda.quienes.map((k) => casa.deptos.find((d) => d.id === k.split(':').at(-1))?.nombre ?? k).join(', ')}.</span>
          <button type="button" className="btn" disabled={ocupado} onClick={duda.seguir}>
            Mandarlos al atrio y seguir
          </button>
          <button type="button" className="btn" disabled={ocupado} onClick={() => setDuda(null)}>
            Cancelar
          </button>
        </div>
      )}

      {libres.length > 0 && (
        <div className="cfg-obra-form" role="group" aria-label="Pedir al ingeniero" onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}>
          <p className="cfg-nota">Pídesela al ingeniero civil: tú dices para quién es y qué necesita, y te presenta un plano para aprobar. Gasta cuota de Claude.</p>
          <div className="cfg-fila">
            <label>
              Departamento
              <select value={pedido.departamento} onChange={(e) => setPedido({ ...pedido, departamento: e.target.value })}>
                <option value="">Sin asignar</option>
                {casa.deptos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Personas
              <select value={pedido.personas} onChange={(e) => setPedido({ ...pedido, personas: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Qué necesita la sala
            <input value={pedido.necesidades} maxLength={600} placeholder="Ej.: revisar normativa y reunirse con clientes" onChange={(e) => setPedido({ ...pedido, necesidades: e.target.value })} />
          </label>
          <button type="button" className="btn principal" disabled={ocupado || pedido.necesidades.trim().length < 5} onClick={() => void alPedir()}>
            Pedir plano
          </button>
        </div>
      )}

      {libres.length > 0 ? (
        <div className="cfg-obra-form" role="group" aria-label="Nueva sala" onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}>
          <p className="cfg-nota">O diseña la sala tú mismo y empieza la obra al momento, sin gastar cuota.</p>
          <div className="cfg-fila">
            <label>
              Nombre
              <input value={f.nombre} maxLength={40} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
            </label>
            <label>
              Dónde
              <select value={sitio} onChange={(e) => setF({ ...f, sitio: e.target.value })}>
                {libres.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="cfg-fila">
            <label>
              Tamaño
              <select value={f.tamano} onChange={(e) => setF({ ...f, tamano: e.target.value })}>
                {catalogo.tamanos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} (hasta {t.puestos} puestos)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Puestos
              <select value={puestos} onChange={(e) => setF({ ...f, puestos: Number(e.target.value) })}>
                {Array.from({ length: maximo }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="cfg-fila">
            <label>
              Estilo
              <select value={f.estilo} onChange={(e) => setF({ ...f, estilo: e.target.value })}>
                {catalogo.estilos.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Muro del fondo
              <select value={f.muro} onChange={(e) => setF({ ...f, muro: e.target.value })}>
                {catalogo.muros.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="cfg-fila">
            <label>
              Departamento
              <select value={f.departamento} onChange={(e) => setF({ ...f, departamento: e.target.value })}>
                <option value="">Sin asignar</option>
                {casa.deptos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className="btn principal" disabled={ocupado || !f.nombre.trim()} onClick={() => void alConstruir()}>
            Construir
          </button>
        </div>
      ) : (
        <p className="cfg-nota">La casa ya tiene todas las salas previstas.</p>
      )}

      {datos.deshacer && (
        <button type="button" className="btn" disabled={ocupado} onClick={() => void deshacer()}>
          Deshacer: {datos.deshacer}
        </button>
      )}
      {error && (
        <p className="cfg-aviso error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
