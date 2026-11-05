import fs from 'node:fs';
import { elegirMotor, registrarResultado, registrarDecision, registrarLimiteInformado, leerLog, cuotaDesdeLog, resumenDeLog } from './coordinador.mjs';
import { perfilDe, herramientasClaude, mcpDeEmpleado } from './perfiles.mjs';
import { motorActual } from './motores.mjs';
const [accion, ...args] = process.argv.slice(2);
if (accion === 'elegir' || accion === 'relevo') {
  // «relevo»: el otro motor continúa porque el primero se quedó sin cuota (si la política lo permite).
  const [modo, empleado, tarea, total] = args;
  let texto = '';
  try { texto = fs.readFileSync(tarea, 'utf8'); } catch {}
  const resultado = elegirMotor({ modo, empleado, texto, requiereEscrituraTotal: total === 'true', relevo: accion === 'relevo' });
  registrarDecision({ empleado, ...resultado });
  process.stdout.write(JSON.stringify(resultado));
} else if (accion === 'modo') {
  // «auto», «claude» o «codex» según config/motores.json.
  process.stdout.write(motorActual());
} else if (accion === 'limite-informado') {
  registrarLimiteInformado(args[0]);
} else if (accion === 'perfil') {
  // Con «total», también las herramientas de Claude según el perfil (modo, permitidas y vetadas).
  // Básico: solo lectura en las conexiones MCP que le permita la matriz.
  const basico = () => { const m = mcpDeEmpleado(args[0], { tope: 'leer' }); return { ...perfilDe(args[0]), mcpPermitidas: m.claude.permitidas, mcpVetadas: m.claude.vetadas, mcpConfig: m.mcpConfig, entorno: m.entorno, instruccion: m.instruccion }; };
  process.stdout.write(JSON.stringify(args[1] === 'total' ? herramientasClaude(args[0]) : basico()));
} else if (accion === 'resumen') {
  // Pasos, costo y subtipo del evento final (Claude); vacío para Codex.
  process.stdout.write(JSON.stringify(resumenDeLog(args[0])));
} else if (accion === 'resultado') {
  // Imprime «limite» si el motor comunicó un límite, para que ejecutar.mjs reintente con el otro.
  const [motor, log] = args;
  let texto = '';
  try {
    const todo = leerLog(log);
    // Solo el evento final (Claude: "type":"result"; Codex: "type":"result" de ejecutar-codex);
    // si no hay, las últimas líneas. Así una mención casual en el trabajo no cuenta como límite.
    const lineas = todo.split(/\r?\n/).filter(Boolean);
    texto = lineas.filter((l) => /"type":\s*"result"/.test(l)).slice(-1)[0] || lineas.slice(-3).join('\n');
  } catch {}
  const limite = registrarResultado(motor, { error: texto });
  if (motor === 'claude' && !limite) cuotaDesdeLog(log);
  process.stdout.write(limite ? 'limite' : 'ok');
} else process.exitCode = 1;
