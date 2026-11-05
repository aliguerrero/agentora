import { useState } from 'react';
import type { FormEvent } from 'react';
import { pedir } from './configApi';
import type { Casa } from '../api';

interface Fila {
  ruta: string;
  id: string;
  nombre: string;
  detalle?: string;
  max: number;
}

function FilaNombre({ fila, onGuardado }: { fila: Fila; onGuardado: (ruta: string, nombre: string) => void }) {
  const [valor, setValor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const texto = valor ?? fila.nombre;
  const cambiado = valor !== null && valor.trim() !== fila.nombre;
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!cambiado) return;
    setOcupado(true);
    setError('');
    try {
      await pedir(fila.ruta, { method: 'PATCH', body: JSON.stringify({ nombre: texto.trim() }) });
      onGuardado(fila.ruta, texto.trim());
      setValor(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  return (
    <form className="cfg-nombre" onSubmit={guardar}>
      <label>
        <span className="cfg-nombre-etiqueta">
          {fila.detalle ?? 'Nombre'} <code>{fila.id}</code>
        </span>
        <span className="cfg-nombre-fila">
          <input value={texto} maxLength={fila.max} disabled={ocupado} onChange={(e) => setValor(e.target.value)} />
          <button type="submit" className="btn" disabled={ocupado || !cambiado || texto.trim().length < 2}>
            Guardar
          </button>
        </span>
      </label>
      {error && (
        <p className="cfg-aviso error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** Cambia los nombres visibles de departamentos y empleados del proyecto seleccionado. */
export function TabOrganizacion({ hogar }: { hogar: Casa | null }) {
  // Lo recién guardado se muestra ya, sin esperar a que la casa vuelva a consultar el estado.
  const [guardados, setGuardados] = useState<Record<string, string>>({});
  if (!hogar) return <p className="cfg-nota">Cargando…</p>;
  const alGuardar = (ruta: string, nombre: string) => setGuardados((g) => ({ ...g, [ruta]: nombre }));
  const agente = (id: string) => hogar.agentes.find((a) => a.id === id);
  const conEquipo = hogar.grupos.filter((g) => g.ids.length > 0);

  return (
    <div className="cfg-form">
      <section className="cfg-grupo">
        <h3>Departamentos</h3>
        <p className="cfg-nota">El departamento conserva su sala y su equipo. Su identificador (en gris) no cambia, para no romper encargos ni carpetas.</p>
        {!hogar.deptos.length && <p className="cfg-nota">Este proyecto aún no tiene departamentos.</p>}
        {hogar.deptos.map((d) => {
          const ruta = `/api/departamentos/${d.id}`;
          return <FilaNombre key={d.id} fila={{ ruta, id: d.id, nombre: guardados[ruta] ?? d.nombre, max: 50 }} onGuardado={alGuardar} />;
        })}
      </section>
      <section className="cfg-grupo">
        <h3>Empleados</h3>
        <p className="cfg-nota">El agente se entera de su nuevo nombre en su ficha y en su memoria. Su carpeta y su identificador no cambian.</p>
        {conEquipo.map((g) => (
          <div key={g.id} className="cfg-nombre-grupo">
            <h4>{guardados[`/api/departamentos/${g.id}`] ?? g.nombre}</h4>
            {g.ids.map((id) => {
              const ruta = `/api/empleados/${id}`;
              const a = agente(id);
              return <FilaNombre key={id} fila={{ ruta, id, nombre: guardados[ruta] ?? a?.nombre ?? id, detalle: a?.rol, max: 40 }} onGuardado={alGuardar} />;
            })}
          </div>
        ))}
      </section>
    </div>
  );
}
