# Preparación para monetización

## Alcance de v1.5

No se integró AdSense, Publisher ID, `ads.txt`, script publicitario, unidad de anuncios ni placeholder visual. La preparación consiste en preservar ubicaciones razonables, documentar criterios y evitar que una futura integración altere el layout o los datos meteorológicos.

## Ubicaciones recomendadas

| Página | Posición | Criterio |
| --- | --- | --- |
| Dashboard | Después del pronóstico extendido y antes del radar. | Separa el bloque de lectura del contenido visual y no está junto al botón de actualizar radar. |
| Dashboard | Después del satélite. | Alternativa secundaria, al final del contenido funcional. |
| Históricos | Después de resumen/comparativas y antes de gráficos, o después de los gráficos principales. | Elegir una sola posición tras medir impacto y evitar proximidad con el selector de período, fecha y CSV. |

No crear el contenedor hasta tener una unidad aprobada: de ese modo no hay texto «Publicidad», espacio vacío ni Cumulative Layout Shift (CLS). Cuando exista una unidad, reservar su espacio sólo durante su carga y probar en móvil antes de habilitarla para todos.

## Rendimiento y experiencia

- Cargar cualquier script publicitario de forma asíncrona y medir LCP, INP y CLS antes/después.
- No insertar anuncios junto a botones, controles del radar/satélite, selector histórico ni enlace de descarga CSV.
- Limitar cantidad y formatos especialmente en pantallas pequeñas; el contenido meteorológico debe seguir siendo prioritario.
- Mantener las atribuciones de Weather.com, Meteored, ClimaSurGBA y CONAE.
- Revisar licencias y términos de cada fuente antes de mostrar anuncios cerca de su contenido.

## GitHub Pages y Blogger

GitHub Pages puede alojar el contenido y, más adelante, un `ads.txt` en su raíz cuando AdSense indique el valor exacto. No se crea `ads.txt` sin Publisher ID real. Para la arquitectura final se recomienda integrar directamente en Blogger, donde la interfaz pública, las páginas editoriales y la configuración de monetización quedan en el mismo host. La estrategia y los cambios de URLs están en [BLOGGER_INTEGRATION.md](BLOGGER_INTEGRATION.md).

## Requisitos previos a AdSense

1. Disponer de contenido y navegación públicos estables, con política de privacidad definitiva.
2. Crear/usar una cuenta de AdSense y conectar el sitio para revisión; no se muestran anuncios antes de la aprobación.
3. Añadir el código y `ads.txt` exactos que entregue Google, sin inventar valores.
4. Configurar el aviso, consentimiento o CMP que corresponda a los visitantes y jurisdicciones objetivo.
5. Revisar Core Web Vitals, Analytics, errores de consola y experiencia móvil tras una implementación limitada.

Google revisa el sitio completo antes de aprobarlo y su política exige divulgar el uso de tecnologías de terceros cuando se activen anuncios. Ver referencias oficiales en [Connect your site to AdSense](https://support.google.com/adsense/answer/7584263) y [Google Publisher Policies](https://support.google.com/adsense/answer/10502938).
