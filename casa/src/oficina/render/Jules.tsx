import { useLayoutEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three';
import type { Group, InstancedMesh, Mesh, PerspectiveCamera, Sprite } from 'three';
import { avanzarPresencia, crearPresencia } from '../animacion/presencia';
import type { PresenciaJules } from '../animacion/presencia';
import type { Rig } from './animador';
import { plano, sueloBajo } from '../mansion/plano';
import { gestoJules, crearPose, nivelSintetico, suavizarPose } from './jules/gesto';
import { avanzarForma, crearForma, esOrbeEnVuelo } from './jules/maquina';
import { CODO_Y, COLORES, CUELLO_Y, HOMBRO_X, HOMBRO_Y, geometriasJules } from './jules/modelo';
import { CENTRO_CUERPO, puntoDePie, yawHaciaCamara } from './jules/posicion';
import { geometria, material, materialBasico } from './recursos';
import { materialHaloJules } from './texturas';

const AMBAR = '#f0a848';
const SATELITES = 7;
const ONDAS = 3;
/** Ámbar del anillo en reposo (0..1); con tonos fríos el anillo toma el color del núcleo. */
const ANILLO_AMBAR = { r: 0.94, g: 0.66, b: 0.28 };

interface Props {
  onTocar?: () => void;
  /** Posición actual de Jules; la comparten las personas para mirarlo. */
  posicion: Vector3;
  /** Persona enfocada o seleccionada: Jules se aparta a un costado para no taparla. */
  apartarDeId: string | null;
  /** La cámara está dentro de un ambiente: sin nadie enfocado, Jules acompaña a un costado del plano. */
  enAmbiente?: boolean;
  /** Mira directo a cámara (por defecto, en tres cuartos). */
  deFrente?: boolean;
  /** Se queda de pie en su sitio de reposo, siempre como personaje (nunca orbe ni aparte). */
  presente?: boolean;
  /** Esqueletos de las personas, por id de agente. */
  rigs: MutableRefObject<Map<string, Rig>>;
  movimiento: number;
  /** Qué está haciendo Jules; cambia el orbe sin recrearlo. */
  presencia: PresenciaJules;
  /** Volumen de la voz de Jules (0..1) mientras `hablando`; sin él se usa un ritmo sintético. */
  nivelVoz?: number;
  /** Dónde espera cuando nadie está enfocado; por defecto, sobre el espejo de agua del atrio. */
  reposo?: { x: number; y: number; z: number };
  /** Tamaño del orbe de viaje (1 = núcleo de 0,42 m); el personaje mide siempre `ESCALA_PERSONAJE`. */
  escala?: number;
}

/** Radio del núcleo de luz (m) a escala 1. */
export const RADIO_NUCLEO = 0.42;
/** Cuánto sube y baja el núcleo al flotar (m, a escala 1), con el reloj de la escena. */
export const flotacionJules = (segundos: number, movimiento: number) =>
  Math.sin(segundos * 1.3 * movimiento) * 0.18;
/** Altura de la cabeza sobre los pies de una persona. */
const ALTURA_CABEZA = 1.4;
/** Rapidez (1/s) con que el orbe vuela hacia su sitio, en reposo y apartándose de alguien. */
const VELOCIDAD = 1.4;
const VELOCIDAD_APARTE = 6;
/** Rapidez (1/s) con que el personaje corrige su sitio cuando el encuadre se mueve poco. */
const VELOCIDAD_SEGUIR = 4;
/** Cuánto se achica el orbe (fracción) mientras acompaña a un costado del encuadre. */
const ACHICA_APARTE = 0.4;
/** Medida del personaje respecto del modelo (1,8 m con pelo): un poco más alta que su equipo. */
const ESCALA_PERSONAJE = 0.95;
/** Cuánto se desvía su mirada de la cámara hacia el enfocado (tres cuartos). */
const DESVIO_TRES_CUARTOS = -0.5;
/** Radio del anillo de cintura y fracción de brillo del halo cuando es personaje. */
const ANILLO_PERSONAJE = 0.78;
const HALO_PERSONAJE = 0.2;
/** Satélites que la acompañan de pie (los 7 restantes son del orbe). */
const SATELITES_PERSONAJE = 3;
/** Amplitud con la que `prefers-reduced-motion` deja de animar el viaje. */
const MOVIMIENTO_REDUCIDO = 0.5;

const suave = (x: number) => x * x * (3 - 2 * x);

/**
 * Jules: jefa de gabinete. De pie es un personaje (melena bob, lentes, blazer terracota,
 * tableta) con un anillo ámbar en la cintura y satélites; viaja entre salas como el orbe de
 * siempre y se rematerializa en su sitio.
 */
export function Jules({
  onTocar,
  posicion,
  apartarDeId,
  enAmbiente = false,
  deFrente = false,
  presente = false,
  rigs,
  movimiento,
  presencia,
  nivelVoz,
  reposo = plano.jules,
  escala = 1,
}: Props) {
  const grupo = useRef<Group>(null);
  const orbe = useRef<Group>(null);
  const cuerpo = useRef<Group>(null);
  const orientacion = useRef<Group>(null);
  const cabezaRef = useRef<Group>(null);
  const bocaRef = useRef<Mesh>(null);
  const hombroTableta = useRef<Group>(null);
  const hombroLibre = useRef<Group>(null);
  const codoLibre = useRef<Group>(null);
  const achicado = useRef(0);
  const iniciado = useRef(false);
  const nucleo = useRef<Mesh>(null);
  const halo = useRef<Sprite>(null);
  const anillo = useRef<Mesh>(null);
  const satelites = useRef<InstancedMesh>(null);
  const ondas = useRef<InstancedMesh>(null);
  const mancha = useRef<Mesh>(null);
  const ayudante = useMemo(() => new Object3D(), []);
  const objetivo = useMemo(() => new Vector3(), []);
  const cabeza = useMemo(() => new Vector3(), []);
  const lado = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);
  const estadoPresencia = useMemo(crearPresencia, []);
  const forma = useMemo(crearForma, []);
  const poseObjetivo = useMemo(crearPose, []);
  const pose = useMemo(crearPose, []);
  const tinte = useMemo(() => new Color(), []);
  const g = useMemo(geometriasJules, []);

  useLayoutEffect(() => {
    const instancias = satelites.current;
    if (!instancias) return;
    for (let i = 0; i < SATELITES; i++) {
      instancias.setColorAt(i, new Color(i % 2 ? '#62c9c0' : '#fff1d6'));
    }
    if (instancias.instanceColor) instancias.instanceColor.needsUpdate = true;
  }, []);

  useFrame((estado, delta) => {
    const raizGrupo = grupo.current;
    const cuerpoG = cuerpo.current;
    if (!raizGrupo || !cuerpoG) return;
    const t = estado.clock.elapsedTime;
    const dt = Math.min(delta, 0.1);
    const camara = estado.camera as PerspectiveCamera;
    const raiz = apartarDeId ? rigs.current.get(apartarDeId)?.raiz : undefined;
    const mira = estado.controls as { target?: Vector3 } | null;
    let aparte = false;
    if (presente) {
      // De pie en su sitio de reposo, sin apartarse ni viajar.
    } else if (raiz) {
      cabeza.set(raiz.position.x, raiz.position.y + ALTURA_CABEZA, raiz.position.z);
      aparte = true;
    } else if (enAmbiente && mira?.target) {
      cabeza.copy(mira.target);
      aparte = true;
    }
    if (aparte) {
      puntoDePie(
        cabeza,
        camara.position,
        camara.fov,
        estado.size.width / estado.size.height,
        sueloBajo(cabeza.y),
        lado,
      );
      objetivo.set(lado.x, lado.y, lado.z);
    } else {
      objetivo.set(reposo.x, sueloBajo(reposo.y) + CENTRO_CUERPO, reposo.z);
    }

    // --- Forma: personaje ↔ orbe, y desplazamiento (solo el orbe vuela) ---
    const reducido = movimiento < MOVIMIENTO_REDUCIDO;
    const distancia = posicion.distanceTo(objetivo);
    let salta = presente;
    if (presente) {
      forma.fase = 'personaje';
      forma.forma = 1;
    } else salta = avanzarForma(forma, distancia, dt, reducido);
    if (salta || !iniciado.current) {
      posicion.copy(objetivo);
      iniciado.current = true;
    } else if (esOrbeEnVuelo(forma)) {
      posicion.lerp(objetivo, Math.min(1, dt * (aparte ? VELOCIDAD_APARTE : VELOCIDAD)));
    } else if (forma.fase === 'personaje') {
      posicion.lerp(objetivo, Math.min(1, dt * VELOCIDAD_SEGUIR));
    }
    raizGrupo.position.copy(posicion);
    achicado.current += ((aparte ? 1 : 0) - achicado.current) * Math.min(1, dt * 4);
    const escOrbe = escala * (1 - ACHICA_APARTE * achicado.current);
    const f = suave(forma.forma);
    const enTransicion = forma.forma > 0 && forma.forma < 1;

    const flota = flotacionJules(t, movimiento) * escOrbe * (1 - f);
    const e = estadoPresencia;
    avanzarPresencia(e, presencia, nivelVoz, dt, Math.min(1, movimiento));

    // --- Personaje: pose, mirada y gestos ---
    cuerpoG.visible = f > 0.01;
    if (cuerpoG.visible) {
      cuerpoG.scale.setScalar(0.2 + 0.8 * f);
      const nivel = nivelVoz === undefined ? nivelSintetico(t) : e.nivel;
      gestoJules(poseObjetivo, presencia, nivel, t, Math.min(1, movimiento));
      suavizarPose(pose, poseObjetivo, 1 - Math.exp(-dt / 0.12));
      if (orientacion.current) {
        orientacion.current.rotation.y = yawHaciaCamara(
          posicion,
          camara.position,
          deFrente ? 0 : aparte ? DESVIO_TRES_CUARTOS : DESVIO_TRES_CUARTOS * 0.5,
        );
      }
      cabezaRef.current?.rotation.set(pose.cabezaPitch, pose.cabezaYaw, pose.cabezaRoll);
      if (bocaRef.current) bocaRef.current.scale.y = 0.35 + pose.boca * 2.6;
      hombroTableta.current?.rotation.set(-0.5 * pose.tableta, -0.35 * pose.tableta, 0);
      hombroLibre.current?.rotation.set(pose.hombroX, 0, -pose.abduccion);
      codoLibre.current?.rotation.set(pose.codo, 0, 0);
    }

    // --- Orbe (forma de viaje) y firma de personaje: anillo y satélites ---
    if (orbe.current) {
      const incl = e.inclinacion * 0.7 * (1 - f);
      orbe.current.rotation.set(incl, 0, -incl);
    }
    const frio = Math.min(1, Math.max(0, (e.b - e.r) * 2));
    if (nucleo.current) {
      nucleo.current.visible = f < 0.99;
      nucleo.current.position.y = flota;
      nucleo.current.scale.setScalar(e.escala * escOrbe * (1 - f));
      (nucleo.current.material as MeshBasicMaterial).color.setRGB(e.r, e.g, e.b, SRGBColorSpace);
    }
    if (halo.current) {
      halo.current.position.y = flota;
      const lado3 = 3.6 * e.escala * e.haloEscala * escOrbe * (1 - f) + 1.8 * f;
      halo.current.scale.set(lado3, lado3, 1);
      const destello = enTransicion ? Math.sin(Math.PI * forma.forma) * 0.5 : 0;
      halo.current.material.opacity = Math.min(
        1,
        Math.max(0, e.brillo * (1 - f) + (HALO_PERSONAJE + 0.1 * e.nivel) * f + destello),
      );
      halo.current.material.color.setRGB(
        e.r * 0.5 + 0.5,
        e.g * 0.5 + 0.5,
        e.b * 0.5 + 0.5,
        SRGBColorSpace,
      );
    }
    if (anillo.current) {
      anillo.current.position.y = flota;
      anillo.current.scale.setScalar(escOrbe * (1 - f) + ANILLO_PERSONAJE * f);
      anillo.current.rotation.x = (1.2 + Math.sin(t * 0.6) * 0.2) * (1 - f) + (Math.PI / 2) * f;
      anillo.current.rotation.y = t * 0.5 * movimiento;
      (anillo.current.material as MeshBasicMaterial).color.setRGB(
        ANILLO_AMBAR.r + (e.r - ANILLO_AMBAR.r) * frio,
        ANILLO_AMBAR.g + (e.g - ANILLO_AMBAR.g) * frio,
        ANILLO_AMBAR.b + (e.b - ANILLO_AMBAR.b) * frio,
        SRGBColorSpace,
      );
    }
    const orbita = satelites.current;
    if (orbita) {
      orbita.count = f > 0.5 ? SATELITES_PERSONAJE : SATELITES;
      for (let i = 0; i < orbita.count; i++) {
        const radio = (0.95 + (i % 3) * 0.18) * e.radSat;
        const angulo = e.faseSat * (0.6 + i * 0.13) + i * 0.9;
        const radioP = 0.72 + i * 0.1;
        const anguloP = e.faseSat * (0.5 + i * 0.12) + i * 2.1;
        ayudante.position.set(
          Math.cos(angulo) * radio * escOrbe * (1 - f) + Math.cos(anguloP) * radioP * f,
          flota +
            Math.sin(angulo * 1.3 + i) * 0.35 * e.radSat * escOrbe * (1 - f) +
            Math.sin(anguloP * 1.3 + i) * (0.18 + i * 0.12) * f,
          Math.sin(angulo) * radio * escOrbe * (1 - f) + Math.sin(anguloP) * radioP * f,
        );
        ayudante.scale.setScalar((1 + (i % 3) * 0.3) * (escOrbe * (1 - f) + f));
        ayudante.updateMatrix();
        orbita.setMatrixAt(i, ayudante.matrix);
      }
      orbita.instanceMatrix.needsUpdate = true;
    }
    const aros = ondas.current;
    if (aros) {
      aros.visible = e.ondasAmp > 0.01 && f < 0.5;
      if (aros.visible) {
        for (let i = 0; i < ONDAS; i++) {
          const fase = (e.faseOnda + i / ONDAS) % 1;
          const radio = (1.3 + e.ondasDir * (fase - 0.5) * 1.5) * escOrbe;
          ayudante.position.set(0, flota, 0);
          ayudante.scale.setScalar(radio);
          ayudante.updateMatrix();
          aros.setMatrixAt(i, ayudante.matrix);
          const alfa = Math.sin(Math.PI * fase) * e.ondasAmp;
          aros.setColorAt(i, tinte.setRGB(e.r * alfa, e.g * alfa, e.b * alfa, SRGBColorSpace));
        }
        aros.instanceMatrix.needsUpdate = true;
        if (aros.instanceColor) aros.instanceColor.needsUpdate = true;
      }
    }
    if (mancha.current) {
      mancha.current.position.set(posicion.x, sueloBajo(posicion.y) + 0.02, posicion.z);
      mancha.current.scale.setScalar(0.45 + 0.55 * (1 - f));
      (mancha.current.material as MeshBasicMaterial).opacity = 0.07 + Math.sin(t * 2.1) * 0.02;
    }
  });

  const cuerpoMat = material(
    'jules-cuerpo',
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
  );

  return (
    <>
      <group ref={grupo} dispose={null} onClick={(e) => { if (onTocar) { e.stopPropagation(); onTocar(); } }} onPointerOver={(e) => { if (onTocar) { e.stopPropagation(); document.body.style.cursor = 'pointer'; } }} onPointerOut={() => { document.body.style.cursor = ''; }}>
        <group ref={cuerpo} visible={false}>
          <group ref={orientacion} position={[0, -CENTRO_CUERPO, 0]} scale={ESCALA_PERSONAJE}>
            <mesh geometry={g.cuerpo} material={cuerpoMat} />
            <group ref={cabezaRef} position={[0, CUELLO_Y, 0]}>
              <mesh geometry={g.cabeza} material={cuerpoMat} />
              <mesh
                ref={bocaRef}
                geometry={g.boca}
                material={material(
                  'jules-boca',
                  () => new MeshStandardMaterial({ color: COLORES.labio, roughness: 0.6 }),
                )}
                position={[0, 0.095, 0.192]}
              />
            </group>
            <group ref={hombroTableta} position={[-HOMBRO_X, HOMBRO_Y, 0]}>
              <mesh geometry={g.brazoTableta} material={cuerpoMat} />
              <mesh
                geometry={g.pantalla}
                material={material(
                  'jules-pantalla',
                  () => new MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false }),
                )}
              />
            </group>
            <group ref={hombroLibre} position={[HOMBRO_X, HOMBRO_Y, 0]}>
              <mesh geometry={g.brazoSuperior} material={cuerpoMat} />
              <group ref={codoLibre} position={[0, CODO_Y, 0]}>
                <mesh geometry={g.brazoInferior} material={cuerpoMat} />
              </group>
            </group>
          </group>
        </group>
        <group ref={orbe}>
          <mesh
            ref={nucleo}
            geometry={geometria('jules-nucleo', () => new SphereGeometry(RADIO_NUCLEO, 28, 20))}
            material={material(
              'jules-nucleo',
              () => new MeshBasicMaterial({ color: '#ffe4b5', toneMapped: false }),
            )}
          />
          <sprite ref={halo} material={materialHaloJules()} scale={[3.6, 3.6, 1]} />
          <mesh
            ref={anillo}
            geometry={geometria('jules-anillo', () => new TorusGeometry(0.75, 0.012, 8, 64))}
            material={material(
              'jules-anillo',
              () =>
                new MeshBasicMaterial({
                  color: AMBAR,
                  toneMapped: false,
                  transparent: true,
                  opacity: 0.7,
                }),
            )}
          />
          <instancedMesh
            ref={satelites}
            args={[
              geometria('jules-satelite', () => new SphereGeometry(0.05, 10, 8)),
              materialBasico('#ffffff'),
              SATELITES,
            ]}
            frustumCulled={false}
          />
          <instancedMesh
            ref={ondas}
            args={[
              geometria('jules-onda', () =>
                new TorusGeometry(1, 0.014, 6, 56).rotateX(Math.PI / 2),
              ),
              material(
                'jules-onda',
                () =>
                  new MeshBasicMaterial({
                    blending: AdditiveBlending,
                    transparent: true,
                    depthWrite: false,
                    toneMapped: false,
                  }),
              ),
              ONDAS,
            ]}
            frustumCulled={false}
            visible={false}
          />
        </group>
      </group>
      <mesh
        ref={mancha}
        geometry={geometria('jules-mancha', () =>
          new CircleGeometry(1.6, 40).rotateX(-Math.PI / 2),
        )}
        material={material(
          'jules-mancha',
          () =>
            new MeshBasicMaterial({
              color: AMBAR,
              transparent: true,
              opacity: 0.08,
              depthWrite: false,
              toneMapped: false,
            }),
        )}
      />
    </>
  );
}
