# Casa 3D de la Oficina DevBox

Vista 3D de la oficina en `http://127.0.0.1:4848/casa`. El motor visual (la casa, los
personajes, las animaciones, la paleta y la tipografía) viene de la **Oficina de Jules** de
Elkis Dev, con licencia MIT (ver `LICENSE` y `LICENCIAS.md`). La app que lo alimenta
(`src/app/DevBox.tsx`, `api.ts`, `PanelAgente.tsx`, `devbox.css`) es propia de DevBox.

- Los empleados salen de `/api/estado` cada 5 s. Cada departamento de `organizacion.json`
  ocupa una sala según su nombre (Plataforma → Desarrollo, Fiscal → Finanzas, Talento →
  Personal…); quien no tiene departamento (gerente, supervisor) trabaja en el atrio.
- Estado: «Trabajando» si tiene una rutina en curso, conversa o está en reunión;
  «Espera tu respuesta» si tiene preguntas sin responder en `bandeja/`; si no, «Libre».
- Tocar a un empleado abre su panel con el chat real (`/api/chat/<id>`).

## Compilar

```bash
cd casa
npm install
npm run build
```

El servidor sirve `casa/dist/`. Tras cambiar algo en `src/`, vuelve a compilar.

No se copiaron el recorrido narrado (voces con licencia de uso personal), el vestidor ni el
«cerebro» de Jules.
