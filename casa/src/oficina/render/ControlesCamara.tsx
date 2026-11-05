import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef, MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { versionEncuadre, versionPlano } from '../mansion/plano';
import type { Ambiente } from '../mansion/plano';
import type { Rig } from './animador';
import {
  DISTANCIA_PERSONA,
  avanzarCamara,
  derivarAzimut,
  desplazamientoDe,
  encuadreAmbiente,
  encuadreCasa,
  leerOrbita,
} from './camara';
import type { EstadoCamara, Punto3 } from './camara';
import {
  acotarObjetivo,
  ELEVACION_GENERAL_MAX,
  ELEVACION_GENERAL_MIN,
  ELEVACION_INICIAL,
  limitesOrbita,
} from './orbita';
import { CENTRO_CUERPO } from './jules/posicion';
import { cajaDePersona, cajasDeLaCasa, elegirVista, lineaLibre, posicionDe } from './visual';
import type { Caja3, Vista } from './visual';
import { useReduceMotion } from './preferencias';

interface Props {
  enfocadoId: string | null;
  /** Ambiente al que se entró; `null` es la casa completa. */
  ambiente: Ambiente | null;
  /** Punto elegido con doble toque (una referencia nueva por cada doble toque), o `null`. */
  foco: Punto3 | null;
  /** Cada vez que cambia, la cámara vuelve a la vista general inicial (dirección incluida). */
  reinicio: number;
  /** Cada vez que cambia, la cámara llega de golpe a su destino (un corte, sin viaje). */
  corte?: number;
  rigs: MutableRefObject<Map<string, Rig>>;
  /** Deriva lenta del azimut (rad/s de pico) mientras el usuario no toca la cámara; 0 = apagada. */
  deriva: number;
  /** Esquiva lo que tapa la cara del enfocado (muros, muebles altos, otras personas). */
  encuadreLibre?: boolean;
  /** Posición de Jules si es ella a quien se enfoca (`enfocadoId` se ignora entonces). */
  jules?: Punto3 | null;
}

/** Altura sobre los pies a la que apunta la cámara (igual que en `avanzarCamara`). */
const ALTURA_MIRA = 1.1;
/** Altura sobre sus pies a la que se encuadra a Jules (la cámara suma `ALTURA_MIRA` a este punto). */
const ALTURA_MIRA_JULES = 0;
/** Hasta dónde puede rodear la cámara un obstáculo (rad desde el frente) y cuánto acercarse. */
const LIMITE_AZIMUT_LIBRE = 1.3;
const DISTANCIA_MIN_LIBRE = 2.2;

/** Segundos tras soltar el arrastre en que se espera a que termine la inercia antes de derivar. */
const PAUSA_TRAS_USUARIO = 1.5;

/**
 * Cámara en perspectiva de casa de muñecas. En reposo la órbita es del usuario: vuelta
 * completa de 360° alrededor de la casa (arrastre o un dedo), zoom (rueda o pellizco) y paneo
 * (clic derecho o dos dedos) con inercia, todo acotado (`limitesOrbita`); dentro de un
 * ambiente la órbita es corta. Según el estado, además viaja suave a la casa completa, a un
 * ambiente, a un punto o a una persona enfocada.
 */
export function ControlesCamara({
  enfocadoId,
  ambiente,
  foco,
  reinicio,
  corte = 0,
  rigs,
  deriva,
  encuadreLibre = false,
  jules = null,
}: Props) {
  const camara = useThree((estado) => estado.camera);
  const { width, height } = useThree((estado) => estado.size);
  const reducirMovimiento = useReduceMotion();
  const clock = useThree((estado) => estado.clock);
  const controles = useRef<ComponentRef<typeof OrbitControls>>(null);

  const version = versionPlano();
  const vista = versionEncuadre();
  const casa = useMemo(() => encuadreCasa(width, height), [width, height, version, vista]);
  const encuadreDelAmbiente = useMemo(
    () => (ambiente ? encuadreAmbiente(ambiente, width, height) : null),
    [ambiente, width, height],
  );
  const limites = useMemo(
    () => limitesOrbita(ambiente, casa, encuadreDelAmbiente),
    [ambiente, casa, encuadreDelAmbiente],
  );

  // El punto de mira solo se fija al montar: al cambiar el tamaño no debe saltar.
  const [objetivoInicial] = useState<[number, number, number]>(() => [
    casa.objetivo.x,
    casa.objetivo.y,
    casa.objetivo.z,
  ]);
  const estado = useRef<EstadoCamara>({
    activo: false,
    x: casa.objetivo.x,
    y: casa.objetivo.y,
    z: casa.objetivo.z,
    distancia: casa.distancia,
    azimut: 0,
    elevacion: ELEVACION_INICIAL,
    clave: casa,
    reorientar: false,
  });
  const vigente = useRef({
    enfocadoId,
    foco,
    casa,
    encuadreDelAmbiente,
    limites,
    reducirMovimiento,
    deriva,
    encuadreLibre,
    jules,
  });
  vigente.current = {
    enfocadoId,
    foco,
    casa,
    encuadreDelAmbiente,
    limites,
    reducirMovimiento,
    deriva,
    encuadreLibre,
    jules,
  };
  const cajasCasa = useMemo(cajasDeLaCasa, [version]);
  const julesMira = useMemo<Punto3>(() => ({ x: 0, y: 0, z: 0 }), []);
  const vistaLibre = useRef<{ clave: string; vista: Vista } | null>(null);
  // Hasta cuándo (reloj de la escena) el usuario manda: durante el arrastre y su inercia.
  const usuarioHasta = useRef(0);
  const desplazamiento = useMemo<Punto3>(() => ({ x: 0, y: 0, z: 0 }), []);
  const desvio = useMemo<Punto3>(() => ({ x: 0, y: 0, z: 0 }), []);

  // Vista inicial: la casa completa de frente.
  useLayoutEffect(() => {
    const inicial = vigente.current.casa;
    camara.position.set(inicial.posicion.x, inicial.posicion.y, inicial.posicion.z);
    camara.lookAt(inicial.objetivo.x, inicial.objetivo.y, inicial.objetivo.z);
    controles.current?.update();
  }, [camara]);

  const corteAnterior = useRef(corte);
  const saltar = useRef(false);
  useLayoutEffect(() => {
    if (corteAnterior.current === corte) return;
    corteAnterior.current = corte;
    saltar.current = true;
  }, [corte]);

  // «Vista general»: vuelve al encuadre inicial, también en dirección.
  const reinicioAnterior = useRef(reinicio);
  useLayoutEffect(() => {
    if (reinicioAnterior.current === reinicio) return;
    reinicioAnterior.current = reinicio;
    estado.current.reorientar = true;
  }, [reinicio]);

  useFrame(({ clock }, delta) => {
    const orbita = controles.current;
    if (!orbita) return;
    const v = vigente.current;
    const e = estado.current;
    // En reposo la cámara es del usuario: el estado solo la sigue para partir de donde está.
    if (!e.activo) {
      e.x = orbita.target.x;
      e.y = orbita.target.y;
      e.z = orbita.target.z;
      leerOrbita(e, camara.position.x - e.x, camara.position.y - e.y, camara.position.z - e.z);
    }
    // Deriva: solo en reposo (o siguiendo a una persona), sin reducir movimiento y sin usuario.
    const derivando =
      v.deriva > 0 &&
      !v.reducirMovimiento &&
      (!e.activo || v.enfocadoId !== null || v.jules !== null) &&
      clock.elapsedTime > usuarioHasta.current;
    if (derivando) {
      const limite = v.enfocadoId === null && v.jules === null ? v.limites.azimutMax : Infinity;
      e.azimut = derivarAzimut(e.azimut, clock.elapsedTime, Math.min(delta, 0.1), v.deriva, limite);
    }
    if (v.jules) {
      // `jules` es el centro de su cuerpo; la cámara espera los pies de la persona enfocada.
      julesMira.x = v.jules.x;
      julesMira.y = v.jules.y - CENTRO_CUERPO + ALTURA_MIRA_JULES;
      julesMira.z = v.jules.z;
    }
    const enfocado = v.jules
      ? julesMira
      : v.enfocadoId
        ? (rigs.current.get(v.enfocadoId)?.raiz.position ?? null)
        : null;
    let vista: Vista | null = null;
    if (v.encuadreLibre && enfocado) {
      const clave = v.jules ? 'jules' : (v.enfocadoId ?? '');
      if (vistaLibre.current?.clave !== clave) vistaLibre.current = null;
      const mira = { x: enfocado.x, y: enfocado.y + ALTURA_MIRA, z: enfocado.z };
      const deseada: Vista = vistaLibre.current?.vista ?? {
        azimut: e.azimut,
        elevacion: Math.min(ELEVACION_GENERAL_MAX, Math.max(ELEVACION_GENERAL_MIN, e.elevacion)),
        distancia: DISTANCIA_PERSONA,
      };
      const cajas: Caja3[] = [...cajasCasa];
      for (const [id, rig] of rigs.current) {
        if (id !== v.enfocadoId) cajas.push(cajaDePersona(rig.raiz.position));
      }
      if (!lineaLibre(posicionDe(mira, deseada), mira, cajas)) {
        vistaLibre.current = {
          clave,
          vista: elegirVista(mira, deseada, cajas, {
            limiteAzimut: LIMITE_AZIMUT_LIBRE,
            elevacionMin: ELEVACION_GENERAL_MIN,
            elevacionMax: ELEVACION_GENERAL_MAX,
            distanciaMin: DISTANCIA_MIN_LIBRE,
          }),
        };
      }
      vista = vistaLibre.current?.vista ?? null;
    } else vistaLibre.current = null;
    const movio = avanzarCamara(e, {
      vista,
      dt: Math.min(delta, 0.1),
      casa: v.casa,
      ambiente: v.encuadreDelAmbiente,
      foco: v.foco,
      enfocado,
      instantaneo: v.reducirMovimiento || saltar.current,
    });
    saltar.current = false;
    if (e.activo) {
      // En viaje no hay límites: la cámara cruza ángulos y distancias que en reposo no se permiten.
      orbita.minAzimuthAngle = -Infinity;
      orbita.maxAzimuthAngle = Infinity;
      orbita.minPolarAngle = 0;
      orbita.maxPolarAngle = Math.PI;
      orbita.minDistance = 0;
      orbita.maxDistance = Infinity;
    } else {
      const l = v.limites;
      orbita.minAzimuthAngle = -l.azimutMax;
      orbita.maxAzimuthAngle = l.azimutMax;
      orbita.minPolarAngle = Math.PI / 2 - l.elevacionMax;
      orbita.maxPolarAngle = Math.PI / 2 - l.elevacionMin;
      orbita.minDistance = l.distanciaMin;
      orbita.maxDistance = l.distanciaMax;
      // El paneo no saca el punto de mira de la caja: la cámara se mueve lo mismo que él.
      acotarObjetivo(orbita.target, l.caja, desvio);
      camara.position.x += desvio.x;
      camara.position.y += desvio.y;
      camara.position.z += desvio.z;
    }
    if (!movio && !derivando) return;
    orbita.target.set(e.x, e.y, e.z);
    desplazamientoDe(e, desplazamiento);
    camara.position.set(e.x + desplazamiento.x, e.y + desplazamiento.y, e.z + desplazamiento.z);
  });

  return (
    <OrbitControls
      ref={controles}
      makeDefault
      target={objetivoInicial}
      onStart={() => {
        usuarioHasta.current = Infinity;
      }}
      onEnd={() => {
        usuarioHasta.current = clock.getElapsedTime() + PAUSA_TRAS_USUARIO;
      }}
      enableDamping={!reducirMovimiento}
      dampingFactor={0.08}
      screenSpacePanning
    />
  );
}
