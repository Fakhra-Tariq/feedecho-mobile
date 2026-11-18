import runtimeSrc from './brainCloudRuntime.raw';
import wordcloudSrc from './vendor/wordcloud2.raw';

const PAGE_BG = '#4A1F3D';

export function buildBrainCloudHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    html, body { margin: 0; padding: 0; background: ${PAGE_BG}; overflow: hidden; width: 100%; height: 100%; }
    #wrap { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: ${PAGE_BG}; }
    canvas { display: block; }
  </style>
</head>
<body>
  <div id="wrap"><canvas id="c"></canvas></div>
  <script>
    if (typeof window.CustomEvent !== 'function') {
      window.CustomEvent = function (event, params) {
        params = params || { bubbles: false, cancelable: false, detail: null };
        var evt = document.createEvent('CustomEvent');
        evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
        return evt;
      };
    }
    var module = undefined; var define = undefined; var exports = undefined;
  </script>
  <script>${wordcloudSrc}</script>
  <script>${runtimeSrc}</script>
</body>
</html>`;
}
