import { useState } from 'react';
import { lugaresDe, plano } from '../../oficina/mansion/plano';
import type { Ambiente, Nivel } from '../../oficina/mansion/plano';
import type { Casa, ConfigCasa } from '../api';
import { ElegirDepartamento } from '../ElegirDepartamento';
import { SALA_REUNIONES, salasAutomaticas, tieneSalasFijas } from '../salas';
import { guardarSeccion } from './configApi';

const PISOS: { nivel: Nivel; nombre: string }[] = [
  { nivel: 'torre', nombre: 'Torre' },
  { nivel: 'piso3', nombre: 'Piso 3' },
  { nivel: 'piso2', nombre: 'Piso 2' },
  { nivel: 'piso1', nombre: 'Piso 1' },
];

interface Zona {
  id: string;
  nombre: string;
  sala: string | null;
  x0: number;
  x1: number;
}

/** Los ambientes de un piso de izquierda a derecha, uniendo los contiguos de una misma sala. */
function zonasDe(nivel: Nivel): Zona[] {
  const zonas: Zona[] = [];
  const lista = plano.ambientes.filter((a: Ambiente) => a.nivel === nivel && a.alto > 0).sort((a, b) => a.x0 - b.x0);
  for (const a of lista) {
    const previa = zonas[zonas.length - 1];
    if (previa && a.departamento && previa.sala === a.departamento) {
      previa.nombre += ` y ${a.nombre.toLowerCase()}`;
      previa.x1 = a.x1;
    } else zonas.push({ id: a.id, nombre: a.nombre, sala: a.departamento === SALA_REUNIONES ? null : a.departamento, x0: a.x0, x1: a.x1 });
  }
  return zonas;
}

interface Props {
  casa: Casa;
  onGuardado: (c: ConfigCasa) => void;
}

/** La casa vista de frente, piso por piso: cada sala con su departamento, puestos y ocupación. */
export function PlanoSalas({ casa, onGuardado }: Props) {
  const [error, setError] = useState('');
  // Con salas construidas el plano se ensancha. Las columnas son metros redondeados, y las de las
  // alas valen doble: una sala de 5 m tiene que caber con su selector.
  const ANCHO = { x0: Math.floor(Math.min(...plano.ambientes.map((a) => a.x0))), x1: Math.ceil(Math.max(...plano.ambientes.map((a) => a.x1))) };
  const ala = (n: number) => (n > 0 ? `repeat(${n}, minmax(0, 2fr)) ` : '');
  const plantilla = `${ala(-16 - ANCHO.x0)}repeat(32, minmax(0, 1fr)) ${ala(ANCHO.x1 - 16)}`.trim();
  const fijas = casa.config?.salas ?? {};
  const proyecto = casa.proyecto;
  const enAtrio = casa.deptos.filter((d) => !casa.salaDe[d.id]);

  const automatica = async () => {
    setError('');
    try {
      onGuardado(await guardarSeccion<ConfigCasa>('casa', { salas: salasAutomaticas(fijas, proyecto?.id) }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="cfg-grupo">
      <h3>Salas de la casa</h3>
      <p className="cfg-nota">
        {proyecto ? (
          <>
            Reparto del proyecto <b>{proyecto.nombre}</b>; cada proyecto tiene el suyo. Se aplica al momento. También puedes cambiarlo al entrar a una sala en la casa.
          </>
        ) : (
          'Crea un proyecto para repartir sus departamentos.'
        )}
      </p>
      {proyecto && casa.deptos.length === 0 && <p className="cfg-nota">Este proyecto todavía no tiene departamentos.</p>}
      <div className="cfg-plano">
        {PISOS.map(({ nivel, nombre }) => (
          <div key={nivel} className="cfg-plano-piso" aria-label={nombre} role="group">
            <small>{nombre}</small>
            <div className="cfg-plano-fila" style={{ ['--plantilla' as string]: plantilla }}>
              {zonasDe(nivel).map((z) => {
                const estilo = { gridColumn: `${Math.round(z.x0 - ANCHO.x0) + 1} / ${Math.round(z.x1 - ANCHO.x0) + 1}` };
                if (!z.sala) {
                  return (
                    <div key={z.id} className="cfg-plano-sala comun" style={estilo}>
                      <span>{z.nombre}</span>
                      {z.id === 'atrio' && enAtrio.length > 0 && <b>{enAtrio.map((d) => d.nombre).join(', ')}</b>}
                    </div>
                  );
                }
                const ocupante = casa.deptos.find((d) => casa.salaDe[d.id] === z.sala);
                const puestos = lugaresDe(z.sala).filter((l) => !l.extra).length;
                const personas = casa.agentes.filter((a) => a.departamento === z.sala).length;
                return (
                  <div key={z.id} className="cfg-plano-sala" style={{ ...estilo, ['--c' as string]: ocupante?.color ?? 'var(--line)' }}>
                    <span>{z.nombre}</span>
                    <small className={personas > puestos ? 'lleno' : undefined}>
                      {personas} de {puestos} puestos
                    </small>
                    <ElegirDepartamento casa={casa} sala={z.sala} onGuardado={onGuardado} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {error && (
        <p className="cfg-aviso error" role="alert">
          {error}
        </p>
      )}
      {tieneSalasFijas(fijas, proyecto?.id) && (
        <button type="button" className="btn" onClick={() => void automatica()}>
          Volver al reparto automático
        </button>
      )}
    </section>
  );
}
