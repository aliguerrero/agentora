# Tu oficina de agentes de IA

Una oficina en 3D donde agentes de IA trabajan en tus proyectos de software: un gerente forma
el equipo, se reparten el trabajo, se piden cosas entre ellos y te avisan cuando te necesitan.
Tú decides en qué se trabaja y cuánta autonomía tienen. Todo corre en tu computadora.

## Qué necesitas

- **Windows 10 u 11, o Linux** con Node.js 22 (probado en Debian; la casa 3D se abre en el navegador).
- **Node.js 22 o superior:** https://nodejs.org
- **Al menos un motor con tu propia cuenta:**
  - Claude Code: https://claude.com/claude-code
  - Codex: https://openai.com/codex

  Con los dos, si uno se queda sin cuota el otro continúa el trabajo. Cada motor consume la
  cuota de tu suscripción.

## Instalar

1. Descomprime esta carpeta donde quieras (por ejemplo, `Documentos\oficina`).
2. **En Windows,** abre PowerShell en esa carpeta y ejecuta:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
   ```

   Comprueba los requisitos, instala lo necesario y compila la casa. Puede tardar varios minutos.
3. Abre la oficina:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\abrir-oficina.ps1
   ```

   **En Linux,** usa estos dos comandos en lugar de los anteriores:

   ```sh
   sh instalar.sh
   sh scripts/abrir-oficina.sh
   ```

   El servidor queda en segundo plano y escribe en `logs/servidor.log`; se apaga con
   `sh scripts/abrir-oficina.sh --apagar`. En un servidor sin escritorio, entra desde tu equipo con
   `ssh -L 4848:127.0.0.1:4848 usuario@servidor` y abre `http://127.0.0.1:4848/casa`.

   La primera vez aparece un asistente: tu nombre, tu zona horaria, la autonomía, los motores
   y tu primer proyecto.

## Tu primer proyecto

Crea uno desde el asistente o desde ⚙ › Proyectos, con una carpeta nueva o un repositorio que
ya tengas (el botón «Buscar…» abre el explorador; en Linux necesita `zenity` o `kdialog`). Nace con un solo agente, su gerente, que analiza el repositorio y forma el equipo.

**Esto ya gasta cuota de tu motor.** Si quieres revisar la configuración antes, apaga los motores
en ⚙ › Motores y actívalos cuando estés listo.

## Lo que puedes configurar (⚙)

| Pestaña | Para qué |
|---|---|
| General | Nombre de la casa, tu nombre, zona horaria, autonomía |
| Proyectos | Crear, pausar o reanudar proyectos; cada uno tiene su propio equipo |
| Equipo | Las personas de tu equipo; sincronización con Jira |
| Contacto | Si los agentes pueden escribirles sin pedir permiso, topes y horario de silencio |
| Conexiones | GitHub, Jira, Figma, Gmail y otros servidores MCP |
| Permisos | Qué puede hacer cada perfil o agente con cada conexión, Git, contratar y contactar |
| Motores | Uso en %, modo automático o manual, relevo, agentes a la vez |
| Túnel | Entrar desde otros dispositivos con Tailscale o Cloudflare, con código de acceso |
| Organización | Cambiar el nombre de departamentos y empleados |
| Casa | Nombres sobre los agentes, letrero, hora, salas y música (carpeta `musica/`) |
| Telegram | Bot para recibir avisos y dar órdenes desde el teléfono |
| Correo | SMTP para que los agentes escriban a tu equipo |
| Compartir | Copias de tu configuración y paquete para otra persona |

## Conviene saber

- **Los agentes ejecutan comandos y editan archivos en tu equipo**, dentro de los permisos que
  les des. Empieza con un proyecto de prueba y revisa ⚙ › Permisos. Por defecto no pueden hacer
  `git push`.
- **Tus tokens y contraseñas** se guardan cifrados: en Windows, con su protección ligada a tu usuario;
  en Linux, con una clave en `~/.config/oficina-devbox` que solo tu usuario puede leer. Esto impide
  leerlos desde otra cuenta o desde una copia de la carpeta, pero no frente a un programa que corra
  con tu mismo usuario. Por eso los agentes, además, tienen vetada esa carpeta.
- **La oficina solo escucha en tu propia computadora** (`127.0.0.1`); no se abre a internet salvo
  que tú abras un túnel (mira «Entrar desde otros dispositivos»).
- **La detección de instrucciones maliciosas** en textos de la web frena los ataques típicos, no
  todos. No le des a un agente más permisos de los que necesita.
- **Las conexiones marcadas «comunitario»** son programas de terceros que se ejecutan con tus
  credenciales: revísalos antes de activarlos.
- **Jira:** la sincronización del equipo funciona con Jira Cloud (`*.atlassian.net`).

## Entrar desde otros dispositivos

La oficina no trae ningún túnel instalado ni abierto. Lo creas tú en ⚙ › Túnel, con una de estas dos
herramientas; la pestaña detecta lo que ya tienes y repite estos pasos. Tu equipo y la oficina tienen
que seguir encendidos.

**Tailscale (recomendado).** Es privado: solo entran los equipos con tu cuenta.

1. En este equipo, descarga [Tailscale para Windows](https://tailscale.com/download/windows), instálalo e
   inicia sesión. Si no tienes cuenta, se crea al entrar. En Linux:
   `curl -fsSL https://tailscale.com/install.sh | sh`, `sudo tailscale up` y
   `sudo tailscale set --operator=$USER`.
2. En ⚙ › Túnel, elige Tailscale y pulsa **Crear túnel**. La primera vez puede aparecer un enlace para
   activar HTTPS: acéptalo y el túnel continúa solo.
3. En el otro dispositivo, instala [Tailscale](https://tailscale.com/download) con la misma cuenta y déjalo
   conectado.
4. Abre allí la dirección que muestra la pestaña y escribe el código de acceso.

Antes de activarlo: HTTPS publica el nombre de tu equipo en un registro público de certificados, así que no
uses un nombre con datos sensibles. El plan gratuito es solo para uso no comercial; si es para una empresa,
revisa los [planes](https://tailscale.com/pricing).

**Cloudflare.** Da un enlace público, sin cuenta y sin instalar nada en el otro dispositivo.

1. En este equipo, descarga e instala
   [cloudflared para Windows](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi)
   (64 bits). En Linux, instálalo desde su
   [página de descargas](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/).
2. En ⚙ › Túnel, elige Cloudflare y pulsa **Crear túnel**.
3. Abre la dirección en el otro dispositivo y escribe el código de acceso.

Limitaciones: según [Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), estos
túneles son para pruebas y desarrollo, no tienen garantía de disponibilidad y no admiten el envío en directo que
usan los chats y las reuniones, así que pueden fallar. La dirección cambia cada vez. En Windows, cloudflared no se
actualiza solo.

**En los dos casos:** quien tenga la dirección y el código puede dar órdenes a tus agentes, así que no los
compartas. Cada túnel genera un código nuevo; cada entrada dura hasta 12 horas. Cerrar el túnel o reiniciar la oficina
desconecta a todos y hay que crearlo otra vez. Desde fuera no se puede tocar el túnel, los secretos ni las conexiones,
ni exportar o restablecer la configuración. Las entradas quedan en `logs/tunel.jsonl`.

## Jornada automática

Para que los agentes trabajen solos de lunes a viernes, aunque la casa esté cerrada:

- **Windows:** `powershell -ExecutionPolicy Bypass -File .\scripts\programar.ps1 -Hora 07:00`
- **Linux:** `sh scripts/programar.sh 07:00` (usa cron; si el equipo está apagado a esa hora, ese día no corre)

Esto gasta cuota de tus motores. Se quita con `-Quitar` en Windows o `--quitar` en Linux.

## Actualizar o mudar la oficina

Tus datos están en `config/`, `contextos/` y `logs/`; el programa no los toca. Para pasar tus
ajustes a otra instalación, usa ⚙ › Compartir › Exportar. Los secretos no se exportan: tendrás
que volver a escribirlos. También al pasar de Windows a Linux o al revés, porque cada sistema los
cifra a su manera.

## Si algo falla

| Problema | Qué hacer |
|---|---|
| La página dice «Falta compilar la casa» | Vuelve a ejecutar `instalar.ps1` |
| El puerto 4848 está ocupado | Define la variable `OFICINA_PUERTO` con otro número antes de arrancar |
| Un motor sale «No instalado» | Instálalo y comprueba que funcione en una terminal (`claude --version`) |
| ⚙ › Túnel dice «No está instalado» | Sigue «Cómo prepararlo» en esa pestaña; la detecta sola al terminar |
| El túnel abre, pero la página da error 403 o queda en blanco | Ciérralo, crea otro y comprueba que estés usando la dirección nueva |
| Una conexión pide iniciar sesión | Sigue los pasos que muestra ⚙ › Conexiones para cada motor |

## Créditos

La casa 3D usa el motor visual de la Oficina de Jules, de Elkis Dev (licencia MIT); ver
`casa/LICENSE` y `casa/LICENCIAS.md`.
