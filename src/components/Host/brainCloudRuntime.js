/* Compact Present-mode brain cloud — same algorithm/params as
 * Web phone-width path (exitTicketBulbLayout.js + ExitTicketWordCloud.js).
 * Uses wordcloud2.js already loaded on the page. */
(function () {
  var PLUM = '#4A1F3D';
  var MASK_OCCUPIED = '#010203';
  var GOLD = '#F4C95D';
  var FILL_THRESHOLD = 40;
  var PHONE_CLOUD_CAP = 220;
  var PHONE_FILL_TARGET = 0.85;
  var CLOUD_FONT_STACK =
    'Inter, system-ui, "Segoe UI", "Noto Nastaliq Urdu", "Noto Sans Arabic", "Segoe UI Historic", Tahoma, sans-serif';

  var BRAIN_SHAPE = {
    designWidth: 700,
    designHeight: 440,
    ellipses: [
      { cx: 198.8, cy: 215, rx: 69.4, ry: 62 },
      { cx: 238.0, cy: 150, rx: 73.9, ry: 66 },
      { cx: 316.4, cy: 118, rx: 76.2, ry: 68 },
      { cx: 400.4, cy: 120, rx: 76.2, ry: 68 },
      { cx: 473.2, cy: 155, rx: 73.9, ry: 66 },
      { cx: 518.0, cy: 215, rx: 69.4, ry: 62 },
      { cx: 249.2, cy: 260, rx: 71.7, ry: 64 },
      { cx: 333.2, cy: 272, rx: 73.9, ry: 66 },
      { cx: 417.2, cy: 268, rx: 69.4, ry: 62 },
      { cx: 484.4, cy: 262, rx: 58.2, ry: 52 },
      { cx: 350.0, cy: 195, rx: 106.4, ry: 95 },
      { cx: 456.4, cy: 335, rx: 80.6, ry: 40 },
    ],
    stem: {
      topLeft: { x: 366, y: 330 },
      topRight: { x: 410, y: 330 },
      bottomRight: { x: 406, y: 420 },
      bottomLeft: { x: 370, y: 420 },
      cornerRadius: 16,
    },
    origin: { x: 350, y: 195 },
  };

  var layoutCache = {};
  var cacheKeys = [];
  var renderGen = 0;

  function hashString(value) {
    var h = 2166136261;
    var s = String(value || '');
    var i;
    for (i = 0; i < s.length; i += 1) {
      h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
    return h >>> 0;
  }

  function sanitizeCloudText(value) {
    return String(value || '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function sortCloudItems(items) {
    return (Array.isArray(items) ? items : [])
      .map(function (item) {
        return {
          key: String(item.key || item.label || ''),
          label: sanitizeCloudText(item.label || item.key || ''),
          count: Math.max(1, Number(item.count) || 1),
        };
      })
      .filter(function (item) {
        return item.label;
      })
      .sort(function (a, b) {
        return b.count - a.count || a.label.localeCompare(b.label);
      });
  }

  function cloudListSeed(items, extra) {
    var body = sortCloudItems(items)
      .map(function (i) {
        return i.key + ':' + i.count;
      })
      .join('|');
    return hashString((extra || '') + '|' + body);
  }

  function installSeededRandom(seed) {
    var original = Math.random;
    var a = (Number(seed) || 1) >>> 0;
    Math.random = function () {
      a += 0x6d2b79f5;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    var restored = false;
    return function () {
      if (restored) return;
      restored = true;
      Math.random = original;
    };
  }

  function brainSilhouetteBounds() {
    var left = Infinity;
    var right = -Infinity;
    var top = Infinity;
    var bottom = -Infinity;
    BRAIN_SHAPE.ellipses.forEach(function (e) {
      left = Math.min(left, e.cx - e.rx);
      right = Math.max(right, e.cx + e.rx);
      top = Math.min(top, e.cy - e.ry);
      bottom = Math.max(bottom, e.cy + e.ry);
    });
    var s = BRAIN_SHAPE.stem;
    left = Math.min(left, s.topLeft.x, s.bottomLeft.x);
    right = Math.max(right, s.topRight.x, s.bottomRight.x);
    top = Math.min(top, s.topLeft.y, s.topRight.y);
    bottom = Math.max(bottom, s.bottomLeft.y, s.bottomRight.y);
    return { left: left, right: right, top: top, bottom: bottom, width: right - left, height: bottom - top };
  }

  function fitBrainBox(availW, availH, viewportW, viewportH) {
    var sil = brainSilhouetteBounds();
    var aspect = sil.width / Math.max(1, sil.height);
    var stageW = Math.max(1, availW);
    var stageH = Math.max(1, availH);
    var vh = Math.max(1, viewportH || stageH);
    var landscape = vh < 500;
    var width;
    var height;
    if (landscape) {
      height = stageH;
      width = height * aspect;
      if (width > stageW) {
        width = stageW;
        height = width / aspect;
      }
      return { width: width, height: height };
    }
    width = stageW;
    height = width / aspect;
    if (height > stageH) {
      height = stageH;
      width = height * aspect;
    }
    return { width: width, height: height };
  }

  function brainMetrics(width, height) {
    var w = Math.max(1, width);
    var h = Math.max(1, height);
    var dw = BRAIN_SHAPE.designWidth;
    var dh = BRAIN_SHAPE.designHeight;
    var sil = brainSilhouetteBounds();
    var boxAspect = w / h;
    var designAspect = dw / dh;
    var silAspect = sil.width / sil.height;
    var useSilhouette = Math.abs(boxAspect - silAspect) + 0.04 < Math.abs(boxAspect - designAspect);
    var mid = BRAIN_SHAPE.ellipses[10];
    var scale;
    var drawnW;
    var drawnH;
    var ox;
    var oy;
    if (useSilhouette) {
      scale = Math.min(w / sil.width, h / sil.height);
      drawnW = sil.width * scale;
      drawnH = sil.height * scale;
      ox = (w - drawnW) / 2 - sil.left * scale;
      oy = (h - drawnH) / 2 - sil.top * scale;
      return {
        w: w,
        h: h,
        scale: scale,
        ox: ox,
        oy: oy,
        drawnW: drawnW,
        drawnH: drawnH,
        cx: ox + BRAIN_SHAPE.origin.x * scale,
        cy: oy + BRAIN_SHAPE.origin.y * scale,
        R: mid.rx * scale,
      };
    }
    var pad = Math.min(w, h) * 0.02;
    scale = Math.min((w - pad * 2) / dw, (h - pad * 2) / dh);
    drawnW = dw * scale;
    drawnH = dh * scale;
    ox = (w - drawnW) / 2;
    oy = (h - drawnH) / 2;
    return {
      w: w,
      h: h,
      scale: scale,
      ox: ox,
      oy: oy,
      drawnW: drawnW,
      drawnH: drawnH,
      cx: ox + BRAIN_SHAPE.origin.x * scale,
      cy: oy + BRAIN_SHAPE.origin.y * scale,
      R: mid.rx * scale,
    };
  }

  function fillStemPath(ctx, stem) {
    var tl = stem.topLeft;
    var tr = stem.topRight;
    var br = stem.bottomRight;
    var bl = stem.bottomLeft;
    var r = Math.min(stem.cornerRadius || 16, Math.abs(br.x - bl.x) / 2, Math.abs(br.y - tr.y) / 2);
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y - r);
    ctx.quadraticCurveTo(br.x, br.y, br.x - r, br.y);
    ctx.lineTo(bl.x + r, bl.y);
    ctx.quadraticCurveTo(bl.x, bl.y, bl.x, bl.y - r);
    ctx.closePath();
    ctx.fill();
  }

  function fillBrainShape(ctx, width, height) {
    var m = brainMetrics(width, height);
    ctx.save();
    ctx.translate(m.ox, m.oy);
    ctx.scale(m.scale, m.scale);
    BRAIN_SHAPE.ellipses.forEach(function (e) {
      ctx.beginPath();
      ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    fillStemPath(ctx, BRAIN_SHAPE.stem);
    ctx.restore();
  }

  function paintBrainOccupancyMask(ctx, width, height) {
    ctx.save();
    ctx.fillStyle = PLUM;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = MASK_OCCUPIED;
    fillBrainShape(ctx, width, height);
    ctx.restore();
  }

  function pointInEllipse(px, py, e) {
    var dx = (px - e.cx) / e.rx;
    var dy = (py - e.cy) / e.ry;
    return dx * dx + dy * dy <= 1;
  }

  function pointInStem(px, py, stem) {
    var y0 = stem.topLeft.y;
    var y1 = stem.bottomLeft.y;
    if (py < y0 || py > y1) return false;
    var t = (py - y0) / Math.max(1, y1 - y0);
    var left = stem.topLeft.x + t * (stem.bottomLeft.x - stem.topLeft.x);
    var right = stem.topRight.x + t * (stem.bottomRight.x - stem.topRight.x);
    return px >= left && px <= right;
  }

  function isPointInBrain(x, y, width, height) {
    var m = brainMetrics(width, height);
    if (m.scale <= 0) return false;
    var dx = (x - m.ox) / m.scale;
    var dy = (y - m.oy) / m.scale;
    if (BRAIN_SHAPE.ellipses.some(function (e) { return pointInEllipse(dx, dy, e); })) return true;
    return pointInStem(dx, dy, BRAIN_SHAPE.stem);
  }

  function isRectInBrain(left, top, right, bottom, width, height) {
    var bw = Math.max(0, right - left);
    var bh = Math.max(0, bottom - top);
    var stepX = Math.max(3, Math.min(10, bw / 8 || 3));
    var stepY = Math.max(3, Math.min(10, bh / 4 || 3));
    var x;
    var y;
    for (x = left; x <= right; x += stepX) {
      if (!isPointInBrain(x, top, width, height)) return false;
      if (!isPointInBrain(x, (top + bottom) / 2, width, height)) return false;
      if (!isPointInBrain(x, bottom, width, height)) return false;
    }
    for (y = top; y <= bottom; y += stepY) {
      if (!isPointInBrain(left, y, width, height)) return false;
      if (!isPointInBrain((left + right) / 2, y, width, height)) return false;
      if (!isPointInBrain(right, y, width, height)) return false;
    }
    return (
      isPointInBrain(right, top, width, height) &&
      isPointInBrain(right, bottom, width, height) &&
      isPointInBrain(left, bottom, width, height)
    );
  }

  function presentFontRangeCss(brainCssWidth) {
    var w = Math.max(1, brainCssWidth);
    var max = Math.round(Math.min(44, Math.max(40, w * 0.118)));
    return { min: 10, max: max };
  }

  function colorForCloudItem(rank, total) {
    if (rank < Math.min(3, total)) return GOLD;
    if (rank % 2 === 0) return '#FFFFFF';
    return '#E8C9DB';
  }

  function fillerTint(index) {
    var opacity = 0.3 + (index % 4) * 0.04;
    if (index % 3 === 1) return 'rgba(232,201,219,' + opacity.toFixed(2) + ')';
    if (index % 3 === 2) return 'rgba(201,160,184,' + opacity.toFixed(2) + ')';
    return 'rgba(255,255,255,' + opacity.toFixed(2) + ')';
  }

  function fillerCountForArea(realCount) {
    var n = Math.max(0, realCount);
    if (n === 0 || n >= FILL_THRESHOLD) return 0;
    return Math.max(0, PHONE_CLOUD_CAP - n);
  }

  function buildBulbCloudLists(items, fillerScale) {
    var real = sortCloudItems(items);
    var maxCount = (real[0] && real[0].count) || 1;
    var minCount = (real[real.length - 1] && real[real.length - 1].count) || 1;
    var realList = real.map(function (item, index) {
      var t = maxCount === minCount ? 1 : (item.count - minCount) / (maxCount - minCount);
      var weight = Math.round(70 + t * 30);
      return [item.label, weight, { real: true, count: item.count, color: colorForCloudItem(index, real.length) }];
    });
    var copies = Math.round(fillerCountForArea(real.length) * (fillerScale || 1));
    var fillerList = [];
    var i;
    for (i = 0; i < copies; i += 1) {
      var item = real[i % real.length];
      fillerList.push([item.label, 22 + (i % 11), { real: false, color: fillerTint(i) }]);
    }
    return { realList: realList, fillerList: fillerList, realCount: real.length };
  }

  function extraFillerList(items, startIndex, count) {
    var real = sortCloudItems(items);
    if (!real.length || count <= 0) return [];
    var list = [];
    var i;
    for (i = 0; i < count; i += 1) {
      var item = real[i % real.length];
      var n = startIndex + i;
      list.push([item.label, 16 + (n % 10), { real: false, color: fillerTint(n) }]);
    }
    return list;
  }

  function wrapCloudText(text, maxWidth, measureWidth) {
    var raw = sanitizeCloudText(text);
    if (!raw) return [];
    var widthOf = function (value) {
      return Number(measureWidth(value)) || 0;
    };
    if (widthOf(raw) <= maxWidth) return [raw];
    var words = raw.split(/\s+/).filter(Boolean);
    if (words.length <= 1) return [raw];
    var pack = function (maxLines) {
      var lines = [];
      var i = 0;
      while (i < words.length && lines.length < maxLines) {
        var lastLine = lines.length === maxLines - 1;
        var take = 1;
        var line = words[i];
        while (i + take < words.length) {
          var next = line + ' ' + words[i + take];
          if (!lastLine && widthOf(next) > maxWidth) break;
          line = next;
          take += 1;
        }
        lines.push(line);
        i += take;
      }
      if (i < words.length) {
        lines[lines.length - 1] = lines[lines.length - 1] + ' ' + words.slice(i).join(' ');
      }
      return lines;
    };
    var n;
    for (n = 2; n <= 3; n += 1) {
      var lines = pack(n);
      if (lines.every(function (line) { return widthOf(line) <= maxWidth * 1.02; }) && lines.length <= n) {
        return lines;
      }
    }
    return pack(3);
  }

  function regionMostlyEmpty(ctx, left, top, right, bottom) {
    var x = Math.max(0, Math.floor(left));
    var y = Math.max(0, Math.floor(top));
    var w = Math.max(1, Math.min(ctx.canvas.width - x, Math.ceil(right) - x));
    var h = Math.max(1, Math.min(ctx.canvas.height - y, Math.ceil(bottom) - y));
    if (w < 1 || h < 1) return false;
    var data = ctx.getImageData(x, y, w, h).data;
    var i;
    for (i = 0; i < data.length; i += 16) {
      if (data[i] + data[i + 1] + data[i + 2] > 24) return false;
    }
    return true;
  }

  function measureSilhouetteCoverage(ctx, width, height) {
    if (!ctx || width < 8 || height < 8) return 0;
    var step = Math.max(2, Math.round(Math.min(width, height) / 160));
    var sil = 0;
    var covered = 0;
    var data = ctx.getImageData(0, 0, width, height).data;
    var y;
    var x;
    for (y = 0; y < height; y += step) {
      for (x = 0; x < width; x += step) {
        if (!isPointInBrain(x, y, width, height)) continue;
        sil += 1;
        var i = (Math.floor(y) * width + Math.floor(x)) * 4;
        if (data[i] + data[i + 1] + data[i + 2] > 18) covered += 1;
      }
    }
    return sil ? covered / sil : 0;
  }

  function placeGuaranteedReal(ctx, row, opts) {
    if (!ctx || !row) return null;
    var label = row[0];
    var color = (row[2] && row[2].color) || '#FFFFFF';
    var count = row[2] && row[2].count;
    var width = opts.width;
    var height = opts.height;
    var minFont = opts.minFont;
    var maxFont = opts.maxFont;
    var fontFamily = opts.fontFamily;
    var m = brainMetrics(width, height);
    var brainW = brainSilhouetteBounds().width * m.scale;
    var maxWordW = brainW * 0.82;
    var offsets = [
      [0, 0],
      [0, m.R * 0.28],
      [0, -m.R * 0.28],
      [m.R * 0.35, 0.08 * m.R],
      [-m.R * 0.35, 0.08 * m.R],
      [m.R * 0.22, m.R * 0.42],
      [-m.R * 0.22, m.R * 0.42],
    ];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var tryFont = function (font, lines) {
      ctx.font = '700 ' + font + 'px ' + fontFamily;
      var lineH = font * 1.16;
      var blockH = lineH * lines.length;
      var blockW = Math.max.apply(null, lines.map(function (line) {
        return ctx.measureText(line).width;
      }));
      if (blockW > maxWordW && lines.length === 1) return null;
      var o;
      for (o = 0; o < offsets.length; o += 1) {
        var cx = m.cx + offsets[o][0];
        var cy = m.cy + offsets[o][1];
        var box = {
          text: label,
          count: count,
          left: cx - blockW / 2,
          right: cx + blockW / 2,
          top: cy - blockH / 2,
          bottom: cy + blockH / 2,
        };
        if (!isRectInBrain(box.left, box.top, box.right, box.bottom, width, height)) continue;
        if (!regionMostlyEmpty(ctx, box.left, box.top, box.right, box.bottom)) continue;
        ctx.fillStyle = color;
        lines.forEach(function (line, i) {
          ctx.fillText(line, cx, box.top + lineH * (i + 0.5));
        });
        return box;
      }
      return null;
    };
    var font;
    for (font = maxFont; font >= minFont; font -= 1) {
      var single = tryFont(font, [label]);
      if (single) return single;
    }
    var wrapStart = Math.max(minFont, Math.round(minFont * 1.15));
    for (font = wrapStart; font >= minFont; font -= 1) {
      ctx.font = '700 ' + font + 'px ' + fontFamily;
      var lines = wrapCloudText(label, maxWordW, function (t) {
        return ctx.measureText(t).width;
      });
      if (lines.length > 1) {
        var wrapped = tryFont(font, lines);
        if (wrapped) return wrapped;
      }
    }
    return null;
  }

  function nowMs() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  function nextAnimationFrame() {
    return new Promise(function (resolve) {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { resolve(); });
      else window.setTimeout(resolve, 16);
    });
  }

  function getWordCloud() {
    if (typeof WordCloud === 'function') return WordCloud;
    if (typeof window.WordCloud === 'function') return window.WordCloud;
    return null;
  }

  function runCloud(WordCloudLib, list, options, timeoutMs, target, onProgress) {
    return new Promise(function (resolve) {
      var el = target;
      if (!list.length) {
        resolve({ drawn: 0, timedOut: false });
        return;
      }
      var drawn = 0;
      var timedOut = false;
      var settled = false;
      var finish = function () {
        if (settled) return;
        settled = true;
        window.clearTimeout(kill);
        el.removeEventListener('wordcloudstop', finish);
        el.removeEventListener('wordcloudabort', finish);
        el.removeEventListener('wordclouddrawn', onDrawn);
        resolve({ drawn: drawn, timedOut: timedOut });
      };
      var onDrawn = function (event) {
        if (event && event.detail && event.detail.drawn) drawn += 1;
        if (typeof onProgress === 'function' && event && event.detail && event.detail.drawn) onProgress();
      };
      var kill = window.setTimeout(function () {
        timedOut = true;
        try {
          if (typeof WordCloudLib.stop === 'function') WordCloudLib.stop();
        } catch (e) {}
        finish();
      }, timeoutMs);
      el.addEventListener('wordcloudstop', finish);
      el.addEventListener('wordcloudabort', finish);
      el.addEventListener('wordclouddrawn', onDrawn);
      WordCloudLib(el, Object.assign({
        fontFamily: CLOUD_FONT_STACK,
        backgroundColor: MASK_OCCUPIED,
        clearCanvas: false,
        minSize: options.minSize,
        drawOutOfBound: false,
        minRotation: 0,
        maxRotation: Math.PI / 2,
        rotationSteps: 2,
        shuffle: true,
        shape: 'square',
        ellipticity: 1,
        wait: 0,
        list: list.map(function (row) { return row.slice(); }),
      }, options));
    });
  }

  function replayFillerOps(ctx, ops, reduceMotion) {
    return new Promise(function (resolve) {
      if (!ops.length) {
        resolve();
        return;
      }
      var duration = reduceMotion ? 400 : 1300;
      var started = nowMs();
      var i = 0;
      var batch = 10;
      var tick = function () {
        var frameStart = nowMs();
        var elapsed = frameStart - started;
        var targetCount = Math.ceil(Math.min(1, elapsed / duration) * ops.length);
        var drawUntil = Math.min(ops.length, Math.max(i + batch, targetCount), i + 14);
        for (; i < drawUntil; i += 1) {
          var op = ops[i];
          ctx.save();
          ctx.setTransform(op.a, op.b, op.c, op.d, op.e, op.f);
          ctx.font = op.font;
          ctx.fillStyle = op.fillStyle;
          ctx.textAlign = op.textAlign;
          ctx.textBaseline = op.textBaseline;
          ctx.fillText(op.text, op.x, op.y);
          ctx.restore();
        }
        var dt = nowMs() - frameStart;
        if (dt > 10) batch = Math.max(6, batch - 2);
        else if (dt < 6) batch = Math.min(14, batch + 1);
        if (i >= ops.length) {
          resolve();
          return;
        }
        if (!reduceMotion && nowMs() - started < duration) {
          var ahead = i / ops.length - (nowMs() - started) / duration;
          nextAnimationFrame().then(function () {
            if (ahead > 0.04) nextAnimationFrame().then(tick);
            else tick();
          });
          return;
        }
        nextAnimationFrame().then(tick);
      };
      tick();
    });
  }

  function rememberCache(key, value) {
    layoutCache[key] = value;
    cacheKeys.push(key);
    if (cacheKeys.length > 6) {
      var first = cacheKeys.shift();
      delete layoutCache[first];
    }
  }

  window.renderBrainCloud = function renderBrainCloud(payload) {
    var canvas = document.getElementById('c');
    if (!canvas) return;
    var WordCloudLib = getWordCloud();
    var myId = (renderGen += 1);
    var cssW = Math.max(40, Number(payload.cssW) || 320);
    var cssH = Math.max(40, Number(payload.cssH) || 240);
    var vw = Number(payload.viewportW) || cssW;
    var vh = Number(payload.viewportH) || cssH;
    var box = fitBrainBox(cssW, cssH, vw, vh);
    var dpr = Math.max(1, Math.min(3, Number(payload.dpr) || window.devicePixelRatio || 1));
    var cw = Math.max(1, Math.round(box.width * dpr));
    var ch = Math.max(1, Math.round(box.height * dpr));
    var items = payload.items || [];
    var seedKey = payload.seedKey || '';
    var reduceMotion = Boolean(payload.reduceMotion);
    var stillCurrent = function () {
      return myId === renderGen;
    };

    var run = async function () {
      if (!stillCurrent() || !items.length) return;
      if (document.fonts && document.fonts.ready) {
        try {
          await Promise.race([
            document.fonts.ready,
            new Promise(function (resolve) { window.setTimeout(resolve, 40); }),
          ]);
        } catch (e) {}
      }
      if (!stillCurrent()) return;
      if (typeof WordCloudLib === 'function' && typeof WordCloudLib.stop === 'function') {
        try { WordCloudLib.stop(); } catch (e) {}
      }
      var fillerScale = 1;
      var drawn = await drawBrainCloud(fillerScale);
      if (!stillCurrent()) return;
      if ((!drawn || drawn < 1) && items.length) {
        drawn = await drawBrainCloud(0.5);
      }
      if (typeof window.ReactNativeWebView !== 'undefined' && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'painted', drawn: drawn || 0 }));
      }
    };

    var drawBrainCloud = async function (fillerScale) {
      if (!WordCloudLib || !WordCloudLib.isSupported) return 0;
      var cacheKey = seedKey + '|' + Math.round(box.width) + 'x' + Math.round(box.height) + '|c|' +
        items.map(function (i) { return (i.key || i.label) + ':' + i.count; }).join('|') + '|' + fillerScale;
      var cached = layoutCache[cacheKey] || null;
      var relayout = Boolean(canvas._cloudReady);
      var work = relayout ? document.createElement('canvas') : canvas;
      if (work !== canvas) {
        work.width = cw;
        work.height = ch;
      } else if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      canvas.style.width = box.width + 'px';
      canvas.style.height = box.height + 'px';
      canvas.style.backgroundColor = PLUM;
      var ctx = work.getContext('2d');
      if (!ctx) return 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      paintBrainOccupancyMask(ctx, cw, ch);

      var blitWork = function () {
        if (work === canvas || !stillCurrent()) return;
        if (canvas.width !== cw || canvas.height !== ch) {
          canvas.width = cw;
          canvas.height = ch;
        }
        var vis = canvas.getContext('2d');
        if (vis) vis.drawImage(work, 0, 0);
      };

      var lists = buildBulbCloudLists(items, fillerScale);
      var realList = lists.realList;
      var fillerList = lists.fillerList;
      var realCount = lists.realCount;
      var seed = cloudListSeed(items, seedKey + '|' + Math.round(box.width) + 'x' + Math.round(box.height) + '|c');
      var metrics = brainMetrics(cw, ch);
      var fonts = presentFontRangeCss(metrics.drawnW / dpr);
      var maxFont = fonts.max * dpr;
      var minSize = fonts.min * dpr;
      var gridSize = Math.max(2, Math.round(2 * dpr));
      var restoreRandom = installSeededRandom(seed);

      var shared = {
        gridSize: gridSize,
        minSize: minSize,
        origin: [metrics.cx, metrics.cy],
        weightFactor: function (weight) {
          return (Number(weight) / 100) * maxFont;
        },
        color: function (word, weight, fontSize, distance, theta, extraMeta) {
          var meta = extraMeta && extraMeta[0];
          return (meta && meta.color) || '#FFFFFF';
        },
      };

      var realHits = [];
      var allHits = [];
      var fillerOps = [];
      var realOps = [];
      var recordingFiller = false;
      var origFill = ctx.fillText.bind(ctx);
      var countByLabel = {};
      realList.forEach(function (row) {
        countByLabel[row[0]] = row[2].count;
      });
      ctx.fillText = function fillTextTracked(text, x, y) {
        if (typeof ctx.getTransform === 'function') {
          var tr = ctx.getTransform();
          var op = {
            text: text,
            x: x,
            y: y,
            font: ctx.font,
            fillStyle: ctx.fillStyle,
            textAlign: ctx.textAlign,
            textBaseline: ctx.textBaseline,
            a: tr.a,
            b: tr.b,
            c: tr.c,
            d: tr.d,
            e: tr.e,
            f: tr.f,
          };
          if (recordingFiller) fillerOps.push(op);
          else realOps.push(op);
          var w = ctx.measureText(text).width;
          var fs = parseFloat(ctx.font) || 16;
          var corners = [
            { x: x, y: y - fs / 2 },
            { x: x + w, y: y - fs / 2 },
            { x: x, y: y + fs / 2 },
            { x: x + w, y: y + fs / 2 },
          ].map(function (pt) {
            return {
              x: tr.a * pt.x + tr.c * pt.y + tr.e,
              y: tr.b * pt.x + tr.d * pt.y + tr.f,
            };
          });
          var xs = corners.map(function (p) { return p.x; });
          var ys = corners.map(function (p) { return p.y; });
          var hitBox = {
            text: text,
            count: countByLabel[text],
            left: Math.min.apply(null, xs),
            right: Math.max.apply(null, xs),
            top: Math.min.apply(null, ys),
            bottom: Math.max.apply(null, ys),
          };
          if (isRectInBrain(hitBox.left, hitBox.top, hitBox.right, hitBox.bottom, cw, ch)) {
            allHits.push(hitBox);
            if (hitBox.count != null) realHits.push(hitBox);
          }
        }
        return origFill(text, x, y);
      };

      var fillerWait = reduceMotion
        ? 0
        : Math.max(4, Math.min(16, Math.round(1700 / Math.max(1, fillerList.length))));
      var drawn = 0;
      var t0 = nowMs();
      try {
        if (cached && cached.realOps && cached.fillerOps && stillCurrent()) {
          var drawOp = function (op) {
            ctx.save();
            ctx.setTransform(op.a, op.b, op.c, op.d, op.e, op.f);
            ctx.font = op.font;
            ctx.fillStyle = op.fillStyle;
            ctx.textAlign = op.textAlign;
            ctx.textBaseline = op.textBaseline;
            origFill(op.text, op.x, op.y);
            ctx.restore();
          };
          cached.realOps.forEach(drawOp);
          blitWork();
          var fadeCtx = work === canvas ? ctx : canvas.getContext('2d');
          await replayFillerOps(fadeCtx || ctx, cached.fillerOps, reduceMotion);
          canvas._cloudReady = true;
          ctx.fillText = origFill;
          restoreRandom();
          return cached.realHits.length + cached.fillerOps.length;
        }

        var reals = await runCloud(
          WordCloudLib,
          realList,
          Object.assign({}, shared, {
            fontWeight: '700',
            shrinkToFit: true,
            rotateRatio: 0,
          }),
          1500,
          work
        );
        drawn += reals.drawn;
        if (stillCurrent()) {
          var placedLabels = {};
          realHits.forEach(function (box) { placedLabels[box.text] = true; });
          realList.forEach(function (row) {
            if (placedLabels[row[0]]) return;
            var gbox = placeGuaranteedReal(ctx, row, {
              width: cw,
              height: ch,
              minFont: Math.max(10 * dpr, minSize),
              maxFont: maxFont,
              fontFamily: CLOUD_FONT_STACK,
            });
            if (gbox) {
              realHits.push(gbox);
              allHits.push(gbox);
              placedLabels[row[0]] = true;
              drawn += 1;
            }
          });
          blitWork();
        }
        recordingFiller = true;
        var fillers = await runCloud(
          WordCloudLib,
          fillerList,
          Object.assign({}, shared, {
            fontWeight: '500',
            shrinkToFit: false,
            rotateRatio: reduceMotion ? 0 : 0.18,
            wait: fillerWait,
          }),
          4000,
          work,
          relayout ? blitWork : undefined
        );
        drawn += fillers.drawn;
        if (stillCurrent()) blitWork();
        if (stillCurrent()) {
          var coverage = measureSilhouetteCoverage(ctx, cw, ch);
          var extraStart = fillerList.length;
          var totalPlacedCap = realCount + extraStart;
          var budgetEnd = t0 + 380;
          while (
            stillCurrent() &&
            coverage < PHONE_FILL_TARGET &&
            totalPlacedCap < PHONE_CLOUD_CAP &&
            nowMs() < budgetEnd
          ) {
            await nextAnimationFrame();
            if (!stillCurrent()) break;
            var want = Math.min(40, PHONE_CLOUD_CAP - totalPlacedCap);
            var extra = extraFillerList(items, extraStart, want);
            if (!extra.length) break;
            extraStart += extra.length;
            totalPlacedCap += extra.length;
            var more = await runCloud(
              WordCloudLib,
              extra,
              Object.assign({}, shared, {
                minSize: Math.max(10 * dpr, Math.round(0.22 * maxFont)),
                fontWeight: '500',
                shrinkToFit: false,
                rotateRatio: reduceMotion ? 0 : 0.18,
                wait: fillerWait,
              }),
              700,
              work
            );
            drawn += more.drawn;
            coverage = measureSilhouetteCoverage(ctx, cw, ch);
            blitWork();
            if (!more.drawn) break;
          }
        }
      } finally {
        ctx.fillText = origFill;
        restoreRandom();
      }
      if (stillCurrent()) blitWork();
      canvas._cloudReady = true;
      if (fillerOps.length || realOps.length) {
        rememberCache(cacheKey, {
          realHits: realHits,
          allHits: allHits,
          realOps: realOps,
          fillerOps: fillerOps,
        });
      }
      return drawn;
    };

    window.setTimeout(function () {
      run();
    }, 0);
  };

  window.renderBrainCloudReady = true;
})();
