import { useState } from 'react';
import type { Casa, ConfigCasa } from './api';
import { guardarSeccion } from './config/configApi';
import { reasignar } from './salas';
import type { ModoOcupante } from './salas';

interface Props {
  casa: Casa;
  /** Id de la sala (el `departamento` del plano). */
  sala: string;
  onGuardado: (c: ConfigCasa) => void;
}

/**
 * Qué departamento ocupa una sala. Se aplica al momento. Si la sala está ocupada, pregunta qué
 * hacer con quien está dentro. Se usa en el plano de Configuración y al entrar a una sala en 3D.
 */
export function ElegirDepartamento({ casa, sala, onGuardado }: Props) {
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const ocupante = casa.deptos.find((d) => casa.salaDe[d.id] === sala) ?? null;
  const elegido = casa.deptos.find((d) => d.id === pendiente);

  const aplicar = async (depto: string, destino: string, modo?: ModoOcupante) => {
    setOcupado(true);
    setError('');
    try {
      const salas = reasignar(casa.deptos, casa.config?.salas ?? {}, casa.proyecto?.id, depto, destino, modo, casa.construidas);
      onGuardado(await guardarSeccion<ConfigCasa>('casa', { salas }));
      setPendiente(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const alCambiar = (valor: string) => {
    if (!valor) return ocupante && void aplicar(ocupante.id, 'atrio');
    if (ocupante) return setPendiente(valor);
    void aplicar(valor, sala);
  };

  return (
    <div className="elegir-depto">
      <select aria-label="Departamento de esta sala" value={pendiente ?? ocupante?.id ?? ''} disabled={ocupado} onChange={(e) => alCambiar(e.target.value)}>
        <option value="">Libre</option>
        {casa.deptos.map((d) => (
          <option key={d.id} value={d.id}>
            {d.nombre}
          </option>
        ))}
      </select>
      {elegido && ocupante && (
        <div className="elegir-depto-duda" role="group" aria-label="La sala está ocupada">
          <span>
            <b>{ocupante.nombre}</b> ocupa esta sala.
          </span>
          {casa.salaDe[elegido.id] && (
            <button type="button" className="btn" disabled={ocupado} onClick={() => void aplicar(elegido.id, sala, 'intercambiar')}>
              Intercambiar
            </button>
          )}
          <button type="button" className="btn" disabled={ocupado} onClick={() => void aplicar(elegido.id, sala, 'atrio')}>
            Mandar {ocupante.nombre} al atrio
          </button>
          <button type="button" className="btn" disabled={ocupado} onClick={() => setPendiente(null)}>
            Cancelar
          </button>
        </div>
      )}
      {error && (
        <span className="cfg-aviso error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
