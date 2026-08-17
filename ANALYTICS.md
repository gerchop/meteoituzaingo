# Analítica futura

No se instala tracking en v1.0. Cuando exista una configuración explícita, evaluar Google Analytics 4 y Microsoft Clarity con consentimiento, política de privacidad y carga diferida cuando corresponda.

## Eventos propuestos

| Evento | Momento | Propiedades mínimas |
| --- | --- | --- |
| `page_view` | Visita al dashboard | página, origen de publicación |
| `hourly_forecast_scroll` | Primer desplazamiento horizontal del pronóstico | método de entrada |
| `radar_refresh` | Botón de actualizar radar | manual |
| `satellite_refresh` | Botón de actualizar satélite | producto |
| `satellite_play_toggle` | Reproducir o pausar | estado resultante |
| `satellite_product_change` | Cambio de producto CONAE | producto |
| `highlight_view` | Condiciones destacadas visibles | tipos, sin datos personales |

No enviar claves, coordenadas precisas del visitante, contenido de `localStorage`, identificadores de estación privados ni valores personales. Medir sólo interacciones agregadas que sirvan para mejorar rendimiento y utilidad del dashboard.
