(function (root, doc) {
  "use strict";
  if (!root || !doc) return;

  var sources = [
    "https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js",
    "https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js"
  ];
  var index = 0;

  function loadNext() {
    if (root.LightweightCharts) {
      root.__tarotaiChartLibraryReady = true;
      return;
    }
    if (index >= sources.length) {
      root.__tarotaiChartLibraryFailed = true;
      return;
    }
    var script = doc.createElement("script");
    script.src = sources[index++];
    script.async = true;
    script.onload = function () {
      if (root.LightweightCharts) {
        root.__tarotaiChartLibraryReady = true;
      } else {
        loadNext();
      }
    };
    script.onerror = loadNext;
    (doc.head || doc.documentElement).appendChild(script);
  }

  loadNext();
})(typeof window !== "undefined" ? window : null,
   typeof document !== "undefined" ? document : null);
