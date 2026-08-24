/* Centralized, non-blocking Cloudflare Web Analytics loader. */
(function loadMeteoAnalytics(windowObject, documentObject) {
  'use strict';

  var config = windowObject.METEO_ANALYTICS_CONFIG;
  var host = windowObject.location && windowObject.location.hostname;

  if (!config || !host || config.localHosts.indexOf(host) !== -1) {
    return;
  }

  var token = config.sites[host];
  if (!token || windowObject.__meteoAnalyticsBeaconLoaded || documentObject.querySelector('script[data-cf-beacon]')) {
    return;
  }

  windowObject.__meteoAnalyticsBeaconLoaded = true;

  var beacon = documentObject.createElement('script');
  beacon.type = 'module';
  beacon.async = true;
  beacon.src = config.beaconUrl;
  beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: token }));
  beacon.onerror = function () {
    windowObject.__meteoAnalyticsBeaconLoaded = false;
  };
  documentObject.head.appendChild(beacon);
}(window, document));
