import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Matrix4, PlaneGeometry, Quaternion, Vector3 } from 'three';
import type { Vector3 as Vec3Three } from 'three';
import type { AgenteOficina, AtuendoResuelto, ModoEtiquetas } from '../tipos';
import { actualizarAtencion, crearAtencion } from '../animacion/atencion';
import type { Atencion } from '../animacion/atencion';
import { avanzarInteracciones, crearCoordinador } from '../animacion/interacciones';
import type { Coordinador } from '../animacion/interacciones';
import { NODO_ASIENTO, NODO_VISITA } from '../animacion/ruta';
import { actualizarPersona, crearSim } from './animador';
import type { Relacion, Rig, Sim } from './animador';
import { planoCorte } from './casa/planoCorte';
import { ORDEN, propio } from './estilos';
import { Flota } from './flota';
import type { Puesto } from './layout';
import { geometriaAnillo, materialAnillo, Persona } from './Persona';
import { geometria } from './recursos';
import { materialBlob } from './texturas';

interface Props {
  agentes: readonly AgenteOficina[];
  atuendos: readonly AtuendoResuelto[];
  puestos: readonly Puesto[];
  seleccionadoId: string | null;
  onSeleccionar: (id: string) => void;
  /** 1 normal, 0,35 con `prefers-reduced-motion`. */
  movimiento: number;
  paseos: boolean;
  /** Sombras reales del sol; si no, cada persona lleva una sombra de contacto. */
  sombras: boolean;
  jules: Vec3Three;
  /** Agente que encuadra la cámara: se detiene, mira a cámara y gesticula; su sala lo mira. */
  enfocadoId?: string | null;
  /** Ambiente donde está la cámara (sin enfoque): su gente pasea la mitad y mira su trabajo. */
  ambienteId?: string | null;
  /** Nadie sale de la sala de su departamento (sin café ni visitas fuera de ella). */
  retenerEnSala?: boolean;
  /** Esqueletos de las personas, por id de agente (también los lee la cámara de enfoque). */
  rigs: MutableRefObject<Map<string, Rig>>;
  etiquetas?: ModoEtiquetas;
}

const ESCALA_UNO = new Vector3(1, 1, 1);

/**
 * Todas las personas. Un único `useFrame` actualiza a las N: avanza la simulación de cada
 * una, calcula las matrices de mundo de su esqueleto y escribe cada pieza como una
 * instancia de la `Flota` (un draw call por tipo de pieza, no por persona). Medido con 30
 * agentes: de 934 draw calls con una malla por pieza a unas decenas.
 *
 * Alternativas descartadas: `SkinnedMesh` por persona (un draw call por persona y más
 * costo de huesos) y fusionar cada persona (pierde la articulación por piezas).
 */
export function Personas({
  agentes,
  atuendos,
  puestos,
  seleccionadoId,
  onSeleccionar,
  movimiento,
  paseos,
  sombras,
  jules,
  enfocadoId = null,
  ambienteId = null,
  retenerEnSala = false,
  rigs,
  etiquetas = 'nunca',
}: Props) {
  const sims = useRef(new Map<string, Sim>());
  // Quién está en el mismo ambiente y cómo se agrupan: si cambia, el coordinador empieza de cero.
  const claveGrupo = useMemo(
    () => agentes.map((a, i) => `${a.id}@${puestos[i]?.sala ?? 0}`).join('|'),
    [agentes, puestos],
  );
  const coordinador = useRef<{ clave: string; c: Coordinador; atencion: Atencion } | null>(null);
  const datos = useRef({
    agentes,
    puestos,
    seleccionadoId,
    movimiento,
    paseos,
    sombras,
    enfocadoId,
    ambienteId,
    retenerEnSala,
  });
  datos.current = {
    agentes,
    puestos,
    seleccionadoId,
    movimiento,
    paseos,
    sombras,
    enfocadoId,
    ambienteId,
    retenerEnSala,
  };
  const flota = useMemo(() => new Flota(), []);
  // Objetos del bucle: se crean una vez y se reutilizan en cada cuadro.
  const reutilizables = useMemo(
    () => ({
      matriz: new Matrix4(),
      posicion: new Vector3(),
      geometriaBlob: geometria('plano-blob', () =>
        new PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2),
      ),
      cartel: new Quaternion(),
      blob: propio(materialBlob()),
      aro: propio(materialAnillo(), ORDEN.anillo),
      relacion: {
        interaccion: null,
        socio: null,
        puestoSocio: null,
        atencion: null,
        foco: null,
      } as Relacion,
    }),
    [],
  );

  useEffect(() => {
    const vigentes = new Set(agentes.map((a) => a.id));
    for (const id of sims.current.keys()) if (!vigentes.has(id)) sims.current.delete(id);
  }, [agentes]);

  useEffect(() => {
    flota.fijarSombras(sombras);
  }, [flota, sombras]);

  useEffect(() => () => flota.liberar(), [flota]);

  useFrame((estado, delta) => {
    const {
      agentes: lista,
      puestos: lugares,
      seleccionadoId: elegido,
      movimiento: mov,
      paseos: pasea,
      sombras: conSombras,
      enfocadoId: idEnfocado,
      ambienteId: idAmbiente,
    } = datos.current;
    const contexto = {
      t: estado.clock.elapsedTime,
      dt: Math.min(delta, 0.1),
      movimiento: mov,
      paseos: pasea,
      azar: Math.random,
      jules,
      camara: estado.camera.position,
      retenerEnSala: datos.current.retenerEnSala,
    };
    const { matriz, posicion, geometriaBlob, cartel, blob, aro, relacion } = reutilizables;
    if (coordinador.current?.clave !== claveGrupo) {
      const salas = lugares.reduce((mayor, p) => Math.max(mayor, p.sala + 1), 1);
      coordinador.current = {
        clave: claveGrupo,
        c: crearCoordinador(lista.length, salas, contexto.t, contexto.azar),
        atencion: crearAtencion(lista.length),
      };
    }
    const coord = coordinador.current.c;
    const atencion = coordinador.current.atencion;
    if (contexto.t >= coord.proximaEvaluacion) {
      // A 4 Hz: lo que cada persona está haciendo → conversaciones y visitas.
      for (let i = 0; i < lista.length; i++) {
        const agente = lista[i];
        const puesto = lugares[i];
        const sim = agente && sims.current.get(agente.id);
        const vista = coord.vistas[i];
        if (!agente || !puesto || !sim || !vista) continue;
        const quieta = sim.nav.hacia < 0;
        vista.sala = puesto.sala;
        vista.estado = agente.estado;
        // En su lugar de trabajo: sentada en su silla, o parada junto a su mueble.
        vista.sentado =
          quieta &&
          sim.nav.nodo === NODO_ASIENTO &&
          (sim.sit > 0.9 || !puesto.sentado) &&
          sim.maquina.paseo === null;
        vista.enPausa =
          quieta && sim.nav.nodo === sim.cadena.length - 1 && sim.maquina.paseo?.fase === 'pausa';
        vista.llego = quieta && sim.tramoVisita && sim.nav.nodo === NODO_VISITA;
        vista.quieta = quieta && sim.atentoListo;
        vista.x = sim.x;
        vista.z = sim.z;
      }
      // Atención al enfoque; quien lo atiende no inicia ni sigue conversaciones ni visitas.
      let enfocado = -1;
      let salaAmbiente = -1;
      for (let i = 0; i < lista.length; i++) {
        if (lista[i]?.id === idEnfocado) enfocado = i;
        if (salaAmbiente < 0 && idAmbiente !== null && lugares[i]?.ambiente === idAmbiente) {
          salaAmbiente = lugares[i]?.sala ?? -1;
        }
      }
      actualizarAtencion(
        atencion,
        lista.length,
        coord.vistas,
        { enfocado, salaAmbiente, julesX: jules.x, julesZ: jules.z, permitido: pasea },
        contexto.t,
      );
      for (let i = 0; i < lista.length; i++) {
        const vista = coord.vistas[i];
        const rol = atencion.personas[i]?.rol;
        if (vista) {
          vista.disponible = lista[i]?.id !== elegido && rol !== 'enfocado' && rol !== 'sala';
        }
      }
      avanzarInteracciones(coord, lista.length, contexto.t, contexto.azar, pasea);
    }
    cartel.copy(estado.camera.quaternion);
    materialAnillo().opacity = 0.55 + Math.sin(contexto.t * 4) * 0.25;
    flota.inicio();
    for (let i = 0; i < lista.length; i++) {
      const agente = lista[i];
      const puesto = lugares[i];
      const rig = agente && rigs.current.get(agente.id);
      if (!agente || !puesto || !rig) continue;
      let sim = sims.current.get(agente.id);
      if (!sim) {
        sim = crearSim(agente, puesto, contexto.t, contexto.azar);
        sims.current.set(agente.id, sim);
      }
      const seleccionado = agente.id === elegido;
      const interaccion = coord.interacciones[i] ?? null;
      const idSocio = interaccion && interaccion.socio >= 0 ? lista[interaccion.socio]?.id : null;
      relacion.interaccion = interaccion;
      relacion.socio = (idSocio && sims.current.get(idSocio)) || null;
      relacion.puestoSocio = (interaccion && lugares[interaccion.socio]) || null;
      relacion.atencion = atencion.personas[i] ?? null;
      const idFoco = atencion.enfocado >= 0 ? lista[atencion.enfocado]?.id : undefined;
      relacion.foco = (idFoco && sims.current.get(idFoco)) || null;
      actualizarPersona(
        sim,
        rig,
        agente,
        puesto,
        seleccionado && agente.estado === 'libre',
        seleccionado,
        contexto,
        relacion,
      );

      // Quien está en un piso sobre el corte de casa de muñecas (dentro de un ambiente) no se dibuja.
      if (sim.y >= planoCorte.constant) continue;

      // Esqueleto → matrices de mundo → una instancia por pieza visible.
      rig.raiz.updateMatrixWorld(true);
      for (const parte of rig.partes) {
        if (!parte.ancla.visible) continue;
        if (parte.cartel) {
          posicion.setFromMatrixPosition(parte.ancla.matrixWorld);
          matriz.compose(posicion, cartel, ESCALA_UNO);
          flota.agregar(parte.geometria, parte.estilo.familia, matriz, null, parte.celda);
        } else {
          flota.agregar(
            parte.geometria,
            parte.estilo.familia,
            parte.ancla.matrixWorld,
            parte.estilo.color,
            parte.celda,
          );
        }
      }
      if (rig.anillo.visible) {
        rig.anillo.updateMatrixWorld();
        flota.agregar(geometriaAnillo(), aro.familia, rig.anillo.matrixWorld, null, 0);
      }
      if (!conSombras) {
        matriz.makeTranslation(sim.x, sim.y + 0.012, sim.z);
        flota.agregar(geometriaBlob, blob.familia, matriz, null, 0);
      }
    }
    flota.fin();
  });

  return (
    <>
      {agentes.map((agente, i) => {
        const atuendo = atuendos[i];
        return atuendo ? (
          <Persona
            key={agente.id}
            agente={agente}
            atuendo={atuendo}
            seleccionado={agente.id === seleccionadoId}
            rigs={rigs}
            onSeleccionar={onSeleccionar}
            etiquetas={etiquetas}
          />
        ) : null;
      })}
      <primitive object={flota.raiz} dispose={null} />
    </>
  );
}
