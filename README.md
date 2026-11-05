# Agentora

**Tu oficina de agentes de IA.**

Organiza equipos de agentes con Claude y Codex en una casa 3D que funciona en tu computadora. Un gerente forma el equipo, distribuye encargos y coordina proyectos; cada agente conserva su propia memoria e informes. Tú eliges el trabajo y el nivel de autonomía.

## Qué incluye

- Equipos y departamentos por proyecto.
- Conversaciones con agentes y seguimiento de su actividad en una casa 3D.
- Encargos, rutinas, reuniones y memoria persistente.
- Claude y Codex, con relevo entre motores según disponibilidad.
- Configuración de permisos, conexiones, notificaciones y acceso remoto opcional.
- Asistente inicial para crear tu propia oficina, sin datos de otra persona.

## Requisitos

Windows 10/11 o Linux, Node.js 22 o superior y npm. Para que los agentes trabajen, instala y autentica al menos uno de los motores: Claude Code o Codex. Cada motor utiliza tu propia cuenta y cuota.

## Instalación

Clona o descarga este repositorio y entra en su carpeta.

En Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\abrir-oficina.ps1
```

En Linux:

```sh
sh instalar.sh
sh scripts/abrir-oficina.sh
```

Abre http://127.0.0.1:4848/casa y completa el asistente con tu nombre, zona horaria, autonomía, motores y primer proyecto.

Consulta [la guía de uso](LEEME.md) para configurar la oficina, las conexiones y la jornada automática.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| casa/ | Interfaz 3D con React y Three.js |
| servidor/ | Servidor local y coordinación de agentes |
| scripts/ | Arranque y herramientas operativas |
| plantilla/ | Instaladores e instrucciones genéricas |

Los directorios de configuración, empleados, proyectos, conversaciones y registros se generan para cada instalación y quedan fuera del repositorio.

## Desarrollo

```sh
cd casa
npm ci
npm run build
```

El servidor sirve la interfaz compilada desde casa/dist/. Antes de trabajar con agentes, consulta OFICINA.md y CLAUDE.md.

## Privacidad y permisos

Las credenciales se configuran desde la interfaz. El servidor escucha en 127.0.0.1; el acceso remoto requiere que configures un túnel. Los agentes pueden ejecutar comandos y modificar proyectos según los permisos que les otorgues.

## Créditos

El motor visual procede de la Oficina de Jules, de Elkis Dev. Se conservan su licencia MIT y los créditos en [casa/LICENSE](casa/LICENSE) y [casa/LICENCIAS.md](casa/LICENCIAS.md). Algunos identificadores internos conservan el nombre histórico DevBox por compatibilidad.
