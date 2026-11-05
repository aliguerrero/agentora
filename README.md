# Oficina DevBox

Oficina virtual de DevBox para coordinar empleados de inteligencia artificial con Claude y Codex, proyectos, encargos y memoria compartida.

La oficina combina una casa 3D en el navegador con un servidor local. Permite organizar departamentos, asignar trabajo, consultar informes y conservar decisiones entre sesiones y motores.

## Funciones

- Empleados con misión, memoria, rutinas, encargos e informes propios.
- Organización por proyectos y departamentos, coordinada por un gerente general.
- Trabajo con Claude y Codex y relevo entre motores según disponibilidad.
- Casa 3D para conversar con agentes y consultar su actividad.
- Reuniones con actas y seguimiento de decisiones.
- Configuración de conexiones, permisos y notificaciones desde la interfaz.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `casa/` | Interfaz de la casa 3D. |
| `servidor/` | Servidor local y coordinación de la oficina. |
| `scripts/` | Arranque y herramientas operativas. |
| `empleados/` | Fichas, memoria y trabajo de los agentes. |
| `plantilla/` | Plantillas para empleados. |
| `reuniones/` | Actas de reuniones. |
| `planes/` | Planificación de trabajo. |
| `OFICINA.md` | Reglas comunes y funcionamiento. |
| `CLAUDE.md` | Instrucciones de entrada compartidas. |

## Inicio local

Se necesita Node.js para ejecutar el servidor. Las funciones de cada motor requieren su instalación y autenticación correspondientes; las conexiones externas se configuran desde la oficina.

En Windows, desde la carpeta de la oficina:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\abrir-oficina.ps1
```

El lanzador inicia el servidor si hace falta y abre `http://127.0.0.1:4848/casa`.
Consulta `casa/LEEME.md` para las instrucciones específicas de la interfaz.

## Trabajo y memoria

Antes de modificar el proyecto, lee `OFICINA.md` y `CLAUDE.md`. Conserva las fichas, memorias, informes y decisiones de Ali. Las capacidades efectivas dependen de los permisos del entorno y de las conexiones disponibles.

## Información local

Las credenciales y la configuración privada se administran desde el área de configuración. No deben subirse archivos `.env`, el directorio `config/`, registros de ejecución ni conversaciones privadas. Revisa los archivos seleccionados antes de cualquier publicación.
