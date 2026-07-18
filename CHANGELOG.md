# Changelog

## v0.7 - 2026-07-18

- El estado actual usa `wxPhraseMedium`, `wxPhraseLong` o `wxPhraseShort` cuando la estación lo informa; se añadió una clasificación de respaldo basada en precipitación, humedad y viento.
- Se sustituyó la tarjeta de radiación solar por punto de rocío, obtenido de la API o calculado con la fórmula de Magnus.
- Se incorporaron secciones responsive de pronóstico horario (12 horas) y extendido (5 días), conectadas a los endpoints oficiales v3 de Weather.com.
- Los pronósticos solo se muestran cuando la clave dispone de autorización para esos productos; en caso contrario se informa claramente sin usar datos simulados.
- Se incorporó un mapa de ubicación con Leaflet y OpenStreetMap, compatible con GitHub Pages y Blogger.
- Se preparó la sección de radar meteorológico para conectar una fuente pública en una próxima versión; todavía no incluye capas de radar por no haber una fuente abierta validada en esta implementación.

## v0.6 - 2026-07-18

- Rediseño completo del dashboard con una cabecera y jerarquía visual renovadas.
- Diseño responsive creado con enfoque móvil primero.
- Tarjetas de condiciones modernizadas y agregado de la lectura de ráfagas.
- Corrección de textos UTF-8 y reemplazo de emojis por iconos de Font Awesome.
- Mejoras de accesibilidad, estados de carga/error y manejo seguro de datos incompletos.
