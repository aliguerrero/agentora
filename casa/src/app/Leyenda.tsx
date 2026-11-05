export function Leyenda() {
  return (
    <div className="hud leyenda" aria-label="Estados">
      <span>
        <i className="barra-trabajando" />
        Trabajando
      </span>
      <span>
        <i className="barra-espera" />
        Espera tu respuesta
      </span>
      <span>
        <i className="barra-libre" />
        Libre
      </span>
    </div>
  );
}
