import { useEffect, useRef, useState } from 'react';
import type { AgenteOficina, EstadoAgente } from '@jules/oficina';
import type { GrupoEquipo } from './api';

const ESTADO: Record<EstadoAgente, string> = {
  trabajando: 'Trabajando',
  esperando_decision: 'Espera tu respuesta',
  libre: 'Libre',
};

interface Props {
  grupos: readonly GrupoEquipo[];
  agentes: readonly AgenteOficina[];
  onElegir: (id: string) => void;
}

/** Todo el equipo por departamento, para hablar con alguien sin buscarlo por la casa. */
export function ListaEquipo({ grupos, agentes, onElegir }: Props) {
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierta(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierta(false);
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierta]);

  return (
    <div className="equipo-menu" ref={caja}>
      <button type="button" className="sala" aria-expanded={abierta} aria-haspopup="true" onClick={() => setAbierta((a) => !a)}>
        Agentes ({agentes.length}) {abierta ? '▴' : '▾'}
      </button>
      {abierta && (
        <div className="equipo-lista" role="group" aria-label="Agentes por departamento">
          {agentes.length === 0 && <p className="sub">Este proyecto aún no tiene agentes.</p>}
          {grupos.map((g) => (
            <section key={g.id} style={{ ['--c' as string]: g.color }}>
              <h3>{g.nombre}</h3>
              <ul>
                {g.ids.map((id) => {
                  const a = agentes.find((x) => x.id === id);
                  if (!a) return null;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => {
                          onElegir(id);
                          setAbierta(false);
                        }}
                      >
                        <i className={`punto-${a.estado}`} title={ESTADO[a.estado]} />
                        <span>
                          <b>{a.nombre}</b>
                          <small>
                            {a.rol} · {ESTADO[a.estado]}
                          </small>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
