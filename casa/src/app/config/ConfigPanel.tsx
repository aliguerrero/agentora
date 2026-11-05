import { useEffect, useRef, useState } from 'react';
import { leerConfig } from './configApi';
import type { General } from './configApi';
import { TabGeneral } from './TabGeneral';
import { TabMotores } from './TabMotores';
import { TabCasa } from './TabCasa';
import { TabTelegram } from './TabTelegram';
import { TabCorreo } from './TabCorreo';
import { TabProyectos } from './TabProyectos';
import { TabEquipo } from './TabEquipo';
import { TabOrganizacion } from './TabOrganizacion';
import { TabContacto } from './TabContacto';
import { TabEncargos } from './TabEncargos';
import { TabCuarentena } from './TabCuarentena';
import { TabConexiones } from './TabConexiones';
import { TabTunel } from './TabTunel';
import { TabPermisos } from './TabPermisos';
import { TabCompartir } from './TabCompartir';
import type { Casa, ConfigCasa } from '../api';
import './config.css';

/** Pestañas del Área de configuración. Las siguientes fases añaden las suyas aquí. */
const PESTANAS = [
  { id: 'general', nombre: 'General' },
  { id: 'proyectos', nombre: 'Proyectos' },
  { id: 'organizacion', nombre: 'Organización' },
  { id: 'equipo', nombre: 'Equipo' },
  { id: 'contacto', nombre: 'Contacto' },
  { id: 'encargos', nombre: 'Encargos' },
  { id: 'cuarentena', nombre: 'Cuarentena' },
  { id: 'conexiones', nombre: 'Conexiones' },
  { id: 'tunel', nombre: 'Túnel' },
  { id: 'permisos', nombre: 'Permisos' },
  { id: 'motores', nombre: 'Motores' },
  { id: 'casa', nombre: 'Casa' },
  { id: 'telegram', nombre: 'Telegram' },
  { id: 'correo', nombre: 'Correo' },
  { id: 'compartir', nombre: 'Compartir' },
] as const;
type Pestana = (typeof PESTANAS)[number]['id'];

interface Props {
  onCerrar: () => void;
  onGeneral: (g: General) => void;
  onCasa: (c: ConfigCasa) => void;
  inicial?: string;
  /** El estado actual de la casa: agentes, departamentos y reparto de salas. */
  hogar: Casa | null;
}

export function ConfigPanel({ onCerrar, onGeneral, onCasa, inicial, hogar }: Props) {
  const [pestana, setPestana] = useState<Pestana>(PESTANAS.some((p) => p.id === inicial) ? (inicial as Pestana) : 'general');
  const [general, setGeneral] = useState<General | null>(null);
  const [casa, setCasa] = useState<ConfigCasa | null>(null);
  const [error, setError] = useState('');
  const cerrar = useRef<HTMLButtonElement>(null);
  const fila = useRef<HTMLElement>(null);

  // En el teléfono la fila se desliza: la pestaña abierta siempre queda a la vista.
  useEffect(() => {
    fila.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pestana]);

  useEffect(() => {
    leerConfig()
      .then((c) => {
        setGeneral(c.general);
        setCasa(c.casa);
      })
      .catch((e: Error) => setError(e.message));
    cerrar.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  return (
    <div className="cfg-fondo" onPointerDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <aside className="cfg" role="dialog" aria-modal="true" aria-label="Configuración">
        <header className="cfg-cab">
          <h2>Configuración</h2>
          <button ref={cerrar} type="button" className="btn-cerrar" onClick={onCerrar} aria-label="Cerrar configuración">
            ×
          </button>
        </header>
        <nav ref={fila} className="cfg-pestanas" role="tablist">
          {PESTANAS.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id} onClick={() => setPestana(p.id)}>
              {p.nombre}
              {p.id === 'cuarentena' && !!hogar?.retenidos && ` (${hogar.retenidos})`}
            </button>
          ))}
        </nav>
        <div className="cfg-cuerpo" role="tabpanel">
          {error && <p className="cfg-aviso error">{error}</p>}
          {pestana === 'general' &&
            (general ? (
              <TabGeneral
                general={general}
                onGuardado={(g) => {
                  setGeneral(g);
                  onGeneral(g);
                }}
              />
            ) : (
              !error && <p className="cfg-nota">Cargando…</p>
            ))}
          {pestana === 'proyectos' && <TabProyectos />}
          {pestana === 'organizacion' && <TabOrganizacion hogar={hogar} />}
          {pestana === 'equipo' && <TabEquipo />}
          {pestana === 'contacto' && <TabContacto />}
          {pestana === 'encargos' && <TabEncargos />}
          {pestana === 'cuarentena' && <TabCuarentena />}
          {pestana === 'conexiones' && <TabConexiones />}
          {pestana === 'tunel' && <TabTunel />}
          {pestana === 'permisos' && <TabPermisos />}
          {pestana === 'motores' && <TabMotores />}
          {pestana === 'telegram' && <TabTelegram />}
          {pestana === 'correo' && <TabCorreo />}
          {pestana === 'compartir' && <TabCompartir />}
          {pestana === 'casa' &&
            (casa ? (
              <TabCasa
                casa={casa}
                hogar={hogar}
                onGuardado={(c) => {
                  setCasa(c);
                  onCasa(c);
                }}
              />
            ) : (
              !error && <p className="cfg-nota">Cargando…</p>
            ))}
        </div>
      </aside>
    </div>
  );
}
