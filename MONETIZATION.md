# Preparación para monetización

No se incorporan anuncios ni scripts de terceros en v1.0.

## Ubicaciones reservadas conceptualmente

1. Después del pronóstico extendido y antes del radar.
2. Después del visor satelital.

No hay contenedores renderizados para estas posiciones hasta que exista una unidad publicitaria configurada. Así se evita espacio vacío, saltos de diseño y proximidad con los botones del radar/satélite.

## Integración futura

- Crear el contenedor sólo cuando el proveedor entregue una unidad válida.
- Reservar dimensiones mediante CSS únicamente al habilitar una unidad; usar formato responsive y no fijar alturas artificiales en móvil.
- Cargar el script de AdSense con `async` y medir su efecto sobre LCP/CLS antes de publicarlo.
- Mantener una separación visual suficiente de controles interactivos y datos meteorológicos.
- Revisar las licencias de ClimaSurGBA y CONAE antes de monetizar sus módulos visibles.
