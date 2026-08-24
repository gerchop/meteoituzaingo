/*
 * Cloudflare Web Analytics identifica sitios mediante un Site Token público.
 * Cada host publicado directamente necesita su propia propiedad/token.
 */
(function configureMeteoAnalytics(windowObject) {
  'use strict';

  windowObject.METEO_ANALYTICS_CONFIG = Object.freeze({
    provider: 'cloudflare-web-analytics',
    beaconUrl: 'https://static.cloudflareinsights.com/beacon.min.js',
    sites: Object.freeze({
      'gerchop.github.io': 'a8de9d5a029b45469adfbfa014a6fc47'
    }),
    localHosts: Object.freeze(['localhost', '127.0.0.1', '::1'])
  });
}(window));
