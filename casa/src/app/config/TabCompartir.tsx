import { useRef, useState } from 'react';
import { pedir } from './configApi';

interface ResultadoImportar {
  secciones: number;
  conexiones: number;
  personas: number;
  avisos: string[];
  respaldo: string;
}
interface Paquete {
  ok: boolean;
  zip?: string;
  archivos?: number;
  tamano?: number;
  error?: string;
  hallazgos?: { archivo: string; motivo: string; texto: string }[];
}

const RESTABLECIBLES: [string, string][] = [
  ['motores', 'Motores'],
  ['casa', 'Casa'],
  ['contacto', 'Política de contacto'],
  ['proyectos', 'Al cambiar de proyecto'],
  ['telegram', 'Interruptor de Telegram'],
];

/** Copias de la configuración, valores de fábrica y paquete para otra persona. */
export function TabCompartir() {
  const [conPersonas, setConPersonas] = useState(false);
  const [plantilla, setPlantilla] = useState(false);
  const [importarPersonas, setImportarPersonas] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportar | null>(null);
  const [paquete, setPaquete] = useState<Paquete | null>(null);
  const [reset, setReset] = useState<Record<string, boolean>>({});
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  const accion = async (fn: () => Promise<void>) => {
    setOcupado(true);
    setAviso(null);
    try {
      await fn();
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  };

  const exportar = () =>
    accion(async () => {
      const datos = await pedir<object>(`/api/config/exportar?personas=${conPersonas && !plantilla ? 1 : 0}&plantilla=${plantilla ? 1 : 0}`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `oficina-${plantilla ? 'plantilla' : 'configuracion'}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setAviso({ tipo: 'ok', texto: 'Copia descargada. No incluye secretos: al importarla hay que volver a escribirlos.' });
    });

  const importar = (f: File) =>
    accion(async () => {
      let datos: unknown;
      try {
        datos = JSON.parse(await f.text());
      } catch {
        throw new Error('Ese archivo no es un JSON válido.');
      }
      if (!confirm('¿Importar esta copia? Sobrescribe los ajustes actuales. Antes se guarda una copia de seguridad.')) return;
      setResultado(await pedir<ResultadoImportar>('/api/config/importar', { method: 'POST', body: JSON.stringify({ datos, personas: importarPersonas }) }));
      setAviso({ tipo: 'ok', texto: 'Copia importada. Recarga la página para ver todos los cambios.' });
    });

  const elegidas = Object.keys(reset).filter((k) => reset[k]);

  return (
    <div className="cfg-form">
      {aviso && <p className={`cfg-aviso ${aviso.tipo}`}>{aviso.texto}</p>}

      <section className="cfg-grupo">
        <h3>Compartir la oficina con otra persona</h3>
        <p className="cfg-nota">
          Crea un .zip con el programa y las instrucciones de instalación: sin tus agentes, proyectos, configuración, secretos ni registros. Antes de comprimir se revisa el contenido y, si aparece algo tuyo, no se crea y te dice dónde está. Cada persona usa sus propias cuentas de Claude o Codex.
        </p>
        <button
          type="button"
          className="btn principal"
          disabled={ocupado}
          onClick={() =>
            void accion(async () => {
              setPaquete(null);
              setPaquete(await pedir<Paquete>('/api/config/paquete', { method: 'POST' }));
            })
          }
        >
          {ocupado ? 'Trabajando…' : 'Crear paquete'}
        </button>
        {paquete?.ok && (
          <p className="cfg-aviso ok">
            Paquete listo ({paquete.archivos} archivos, {((paquete.tamano ?? 0) / 1048576).toFixed(1)} MB): <code>{paquete.zip}</code>
          </p>
        )}
        {paquete && !paquete.ok && (
          <div className="cfg-aviso error">
            <p>No se creó el paquete{paquete.error ? `: ${paquete.error}` : ', porque encontró datos tuyos:'}</p>
            <ul>
              {paquete.hallazgos?.map((h, i) => (
                <li key={i}>
                  {h.archivo}: {h.motivo} ({h.texto})
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="cfg-grupo">
        <h3>Exportar mi configuración</h3>
        <label className="cfg-check">
          <input type="checkbox" checked={plantilla} onChange={(e) => setPlantilla(e.target.checked)} />
          <span>
            Como plantilla para otra persona
            <small>Sin tu nombre, tus proyectos, tu correo ni tu equipo: solo ajustes, permisos y conexiones.</small>
          </span>
        </label>
        <label className="cfg-check">
          <input type="checkbox" disabled={plantilla} checked={conPersonas && !plantilla} onChange={(e) => setConPersonas(e.target.checked)} />
          <span>
            Incluir el directorio de personas
            <small>Lleva sus correos y teléfonos: guarda el archivo con cuidado.</small>
          </span>
        </label>
        <button type="button" className="btn" disabled={ocupado} onClick={() => void exportar()}>
          Descargar copia
        </button>
      </section>

      <section className="cfg-grupo">
        <h3>Importar una copia</h3>
        <label className="cfg-check">
          <input type="checkbox" checked={importarPersonas} onChange={(e) => setImportarPersonas(e.target.checked)} /> <span>Importar también las personas, si la copia las trae</span>
        </label>
        <input
          ref={archivo}
          type="file"
          accept="application/json,.json"
          disabled={ocupado}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importar(f);
          }}
        />
        {resultado && (
          <div className="cfg-nota">
            <p>
              Importadas {resultado.secciones} secciones, {resultado.conexiones} conexiones y {resultado.personas} personas. Copia de seguridad previa: <code>{resultado.respaldo}</code>
            </p>
            {resultado.avisos.length > 0 && (
              <ul>
                {resultado.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="cfg-grupo">
        <h3>Valores de fábrica</h3>
        <p className="cfg-nota">Vuelve estos ajustes a sus valores iniciales. No toca tu nombre, secretos, personas, conexiones, permisos, proyectos ni agentes. Antes se guarda una copia de seguridad.</p>
        {RESTABLECIBLES.map(([k, nombre]) => (
          <label key={k} className="cfg-check">
            <input type="checkbox" checked={!!reset[k]} onChange={(e) => setReset({ ...reset, [k]: e.target.checked })} /> <span>{nombre}</span>
          </label>
        ))}
        <button
          type="button"
          className="btn"
          disabled={ocupado || !elegidas.length}
          onClick={() => {
            if (!confirm(`¿Restablecer ${elegidas.length} ${elegidas.length === 1 ? 'ajuste' : 'ajustes'}?`)) return;
            void accion(async () => {
              const r = await pedir<{ respaldo: string }>('/api/config/restablecer', { method: 'POST', body: JSON.stringify({ secciones: elegidas }) });
              setReset({});
              setAviso({ tipo: 'ok', texto: `Restablecido. Copia de seguridad: ${r.respaldo}` });
            });
          }}
        >
          Restablecer
        </button>
      </section>
    </div>
  );
}
