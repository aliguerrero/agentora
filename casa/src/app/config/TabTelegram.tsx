import { useCallback, useEffect, useState } from 'react';
import { guardarSeccion, hace, pedir } from './configApi';

interface EstadoTelegram {
  configurado: boolean;
  activo: boolean;
  escuchando: boolean;
  vinculado: boolean;
  codigo: string | null;
  bot: { usuario: string; nombre: string } | null;
  error: { texto: string; fecha: string } | null;
  personas: Record<string, { nombre: string; vinculado: string }>;
  invitaciones: { persona: string; vence: string }[];
  token: { configurado: boolean; pista: string; actualizado: string } | null;
}

/** Bot de Telegram: token, interruptor, vinculación del titular y personas del equipo. */
export function TabTelegram() {
  const [e, setE] = useState<EstadoTelegram | null>(null);
  const [token, setToken] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setE(await pedir<EstadoTelegram>('/api/telegram'));
    } catch (err) {
      setAviso({ tipo: 'error', texto: (err as Error).message });
    }
  }, []);
  useEffect(() => {
    void cargar();
    const t = setInterval(() => void cargar(), 5000); // para ver al instante cuando te vinculas
    return () => clearInterval(t);
  }, [cargar]);

  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await fn();
      setAviso({ tipo: 'ok', texto: ok });
      await cargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: (err as Error).message });
    } finally {
      setOcupado(false);
    }
  };

  if (!e) return <p className="cfg-nota">{aviso?.texto || 'Cargando…'}</p>;
  const personas = Object.entries(e.personas);
  const enlace = e.bot && e.codigo ? `https://t.me/${e.bot.usuario}?start=${e.codigo}` : null;

  return (
    <div className="cfg-form">
      {aviso && <p className={`cfg-aviso ${aviso.tipo}`}>{aviso.texto}</p>}

      <section className="cfg-grupo">
        <h3>Bot</h3>
        <div className="cfg-linea">
          <div>
            <b>Telegram {e.escuchando ? 'activo' : 'detenido'}</b>
            <span>
              {e.bot ? `@${e.bot.usuario} · ` : ''}
              {!e.configurado ? 'Falta el token del bot.' : !e.activo ? 'Desactivado: no recibe ni envía mensajes.' : e.escuchando ? 'Escuchando mensajes.' : 'Arrancando…'}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={e.activo}
            aria-label="Telegram activo"
            className="cfg-switch"
            disabled={ocupado}
            onClick={() => void accion(() => guardarSeccion('telegram', { activo: !e.activo }), e.activo ? 'Telegram desactivado.' : 'Telegram activado.')}
          >
            <i />
          </button>
        </div>
        {e.error && <p className="cfg-aviso error">Último error {hace(e.error.fecha)}: {e.error.texto}</p>}
        <label>
          Token del bot {e.token ? `(guardado ${e.token.pista})` : '(sin configurar)'}
          <span className="cfg-fila">
            <input type="password" value={token} onChange={(x) => setToken(x.target.value)} placeholder="123456789:AA…" autoComplete="off" spellCheck={false} style={{ flex: 1 }} />
            <button
              type="button"
              className="btn principal"
              disabled={ocupado || !token.trim()}
              onClick={() =>
                void accion(async () => {
                  await pedir('/api/config/secretos/TELEGRAM_TOKEN', { method: 'PUT', body: JSON.stringify({ valor: token.trim() }) });
                  setToken('');
                }, 'Token verificado y guardado cifrado.')
              }
            >
              Verificar y guardar
            </button>
          </span>
        </label>
        <p className="cfg-nota">
          Créalo con <b>@BotFather</b> en Telegram (/newbot) y pega aquí el token. Se comprueba con Telegram antes de guardarlo y queda cifrado; nunca se vuelve a mostrar.
        </p>
        {e.token && (
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={ocupado} onClick={() => confirm('¿Quitar el token? El bot dejará de funcionar.') && void accion(() => pedir('/api/config/secretos/TELEGRAM_TOKEN', { method: 'DELETE' }), 'Token quitado.')}>
            Quitar token
          </button>
        )}
      </section>

      <section className="cfg-grupo">
        <h3>Tu Telegram (titular)</h3>
        {e.vinculado ? (
          <>
            <p className="cfg-nota">Vinculado. Te llegan informes, preguntas, actas (con botones) y trabajos terminados; lo que escribas es una orden para el gerente.</p>
            <div className="cfg-fila">
              <button type="button" className="btn" disabled={ocupado || !e.escuchando} onClick={() => void accion(() => pedir('/api/telegram/probar', { method: 'POST' }), 'Mensaje de prueba enviado.')}>
                Enviar prueba
              </button>
              <button type="button" className="btn" disabled={ocupado} onClick={() => confirm('¿Desvincular tu Telegram? Dejarás de recibir avisos hasta vincularlo otra vez.') && void accion(() => pedir('/api/telegram/desvincular', { method: 'POST' }), 'Desvinculado. Usa el código nuevo para vincular otro teléfono.')}>
                Desvincular
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="cfg-nota">
              Abre {e.bot ? <b>@{e.bot.usuario}</b> : 'tu bot'} en Telegram y envíale:
            </p>
            <code className="cfg-codigo">/vincular {e.codigo}</code>
            <div className="cfg-fila">
              {enlace && (
                <a className="btn principal" href={enlace} target="_blank" rel="noopener">
                  Abrir en Telegram
                </a>
              )}
              <button type="button" className="btn" disabled={ocupado} onClick={() => void accion(() => pedir('/api/telegram/codigo', { method: 'POST' }), 'Código nuevo generado.')}>
                Código nuevo
              </button>
            </div>
          </>
        )}
      </section>

      <section className="cfg-grupo">
        <h3>Personas del equipo</h3>
        <p className="cfg-nota">
          Cada persona se vincula con su propio código y solo ve lo que un agente le escribe; nunca ve tus mensajes. Las invitaciones se generan desde la ficha de cada persona, en la pestaña Equipo.
        </p>
        {personas.length ? (
          <ul className="cfg-lista">
            {personas.map(([id, p]) => (
              <li key={id}>
                <b>{p.nombre}</b>
                <small>vinculado {hace(p.vinculado)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cfg-nota">Nadie del equipo tiene Telegram vinculado todavía.</p>
        )}
      </section>
    </div>
  );
}
