/* interactive-review SPA. Expects window.IR from /config.js */
(function () {
  const IR = window.IR || {};
  const token = IR.token || "";
  const heartbeatMs = IR.heartbeatMs || 5000;

  const svg = document.getElementById("canvas");
  const viewport = document.getElementById("viewport");
  const gridBg = document.getElementById("grid-bg");
  const figureTitle = document.getElementById("figure-title");
  const prLink = document.getElementById("pr-link");
  const summaryEl = document.getElementById("summary");
  const summaryProblem = document.getElementById("summary-problem");
  const summaryChange = document.getElementById("summary-change");
  const conn = document.getElementById("conn");
  const btnStop = document.getElementById("btn-stop");
  const panelEyebrow = document.getElementById("panel-eyebrow");
  const panelTitle = document.getElementById("panel-title");
  const panelRole = document.getElementById("panel-role");
  const panelEvidence = document.getElementById("panel-evidence");
  const thread = document.getElementById("thread");
  const composer = document.getElementById("composer");
  const askInput = document.getElementById("ask-input");
  const composerHint = document.getElementById("composer-hint");
  const btnSend = document.getElementById("btn-send");

  const NODE_W = 200;
  const NODE_H = 56;
  const COL_W = 280;
  const GAP_X = 80;
  const GAP_COL = 200;
  const GAP_Y = 140;
  const STACK_GAP = 48;
  const PAD = 152;
  const NODE_ORIGIN = 72;
  const EDGE_FAN = 22;
  const BULLET_H = 13;
  const ANN_W = 280;
  const REVERSE_CLEAR = 52;
  const TOP_CLEAR = 64;
  const LABEL_PAD = 10;

  const MARKER = {
    control: "url(#arrow-control)",
    "data-happy": "url(#arrow-happy)",
    "data-other": "url(#arrow-other)",
    once: "url(#arrow-once)",
  };

  let graph = null;
  let selectedId = null;
  let view = { x: 40, y: 20, k: 1 };
  let dragging = false;
  let lastPtr = null;
  let pendingAsk = null;
  let live = false;
  const threads = { _all: [] };

  function headers() {
    const h = { "Content-Type": "application/json" };
    if (token) h.Authorization = "Bearer " + token;
    return h;
  }

  function safeHttpUrl(value) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      return parsed.href;
    } catch (err) {
      return "";
    }
  }

  function setConn(state, label) {
    conn.className = "pill pill-" + state;
    conn.textContent = label;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderMarkdown(src) {
    let s = escapeHtml(src);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    s = s.replace(/^- (.+)$/gm, "<li>$1</li>");
    s = s.replace(/(?:<li>.*<\/li>\n?)+/g, function (block) {
      return "<ul>" + block + "</ul>";
    });
    s = s.split(/\n{2,}/).map(function (p) {
      return "<p>" + p.replace(/\n/g, "<br>") + "</p>";
    }).join("");
    return s;
  }

  function packed(n) {
    return (n.bullets && n.bullets.length) || (n.sections && n.sections.length) || n.subtitle;
  }

  function packedBodyTop(n) {
    return 22 + (n.subtitle ? 15 : 0) + 12;
  }

  function sectionHeight(s) {
    let lines = 0;
    (s.bullets || []).forEach(function (b) {
      lines += wrapLabel(b, 36).length;
    });
    return 10 + 14 + lines * BULLET_H + 8;
  }

  function nodeHeight(n) {
    if (!packed(n)) return NODE_H;
    let h = packedBodyTop(n);
    (n.bullets || []).forEach(function (b) {
      h += wrapLabel(b, 38).length * BULLET_H;
    });
    (n.sections || []).forEach(function (s) {
      h += sectionHeight(s);
    });
    return h + 14;
  }

  function nodeWidth(n) {
    return packed(n) ? COL_W : NODE_W;
  }

  function wrapLabel(text, maxChars) {
    const src = String(text || "").trim();
    if (!src) return [];
    if (src.length <= maxChars) return [src];
    const words = src.split(/\s+/);
    const lines = [];
    let cur = "";
    words.forEach(function (w) {
      const next = cur ? cur + " " + w : w;
      if (next.length > maxChars && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = next;
      }
    });
    if (cur) lines.push(cur);
    return lines.slice(0, 4);
  }

  function layout(g) {
    const landscape = g.layout !== "rows";
    const bands = g.bands && g.bands.length
      ? g.bands
      : [{ id: "_default", label: "" }];
    const byBand = {};
    bands.forEach(function (b) {
      byBand[b.id] = [];
    });
    g.nodes.forEach(function (n) {
      const bid = n.band && byBand[n.band] ? n.band : bands[0].id;
      byBand[bid].push(n);
    });
    const anns = g.annotations || [];
    g._landscape = landscape;
    g._bands = bands;
    if (landscape) {
      let maxBottom = PAD;
      bands.forEach(function (band, bi) {
        const nodes = byBand[band.id] || [];
        const x = NODE_ORIGIN + bi * (COL_W + GAP_COL);
        band._x = x;
        band._y = 28;
        let y = PAD;
        nodes.forEach(function (n) {
          n._w = nodeWidth(n);
          n._h = nodeHeight(n);
          n._x = x;
          n._y = y;
          y += n._h + STACK_GAP;
        });
        if (y > maxBottom) maxBottom = y;
      });
      g.nodes.forEach(layoutAnchors);
      g._routeBottom = maxBottom + REVERSE_CLEAR + 24;
      g._annY = g._routeBottom + 56;
      g._width = NODE_ORIGIN + bands.length * (COL_W + GAP_COL) + PAD;
      g._height = g._annY + (anns.length ? 96 : 64);
    } else {
      let y = PAD;
      let maxCol = 0;
      bands.forEach(function (band) {
        const nodes = byBand[band.id] || [];
        nodes.forEach(function (n, i) {
          n._h = nodeHeight(n);
          n._w = nodeWidth(n);
          n._col = typeof n.column === "number" ? n.column : i;
          if (n._col > maxCol) maxCol = n._col;
        });
        const rowH = nodes.reduce(function (h, n) {
          return Math.max(h, n._h);
        }, NODE_H);
        nodes.forEach(function (n) {
          n._x = NODE_ORIGIN + n._col * (COL_W + GAP_X);
          n._y = y + (rowH - n._h) / 2;
        });
        band._y = y + rowH / 2;
        y += rowH + GAP_Y;
      });
      g.nodes.forEach(layoutAnchors);
      g._routeBottom = y + REVERSE_CLEAR;
      g._annY = g._routeBottom + 48;
      g._width = NODE_ORIGIN + (maxCol + 1) * (COL_W + GAP_X) + PAD;
      g._height = g._annY + (anns.length ? 96 : 64);
    }
    if (anns.length) {
      g._width = Math.max(g._width, PAD + anns.length * (ANN_W + 16));
    }
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function layoutAnchors(n) {
    n._anchors = {};
    if (!packed(n) || !(n.sections || []).length) return;
    let y = n._y + packedBodyTop(n);
    (n.bullets || []).forEach(function (b) {
      y += wrapLabel(b, 38).length * BULLET_H;
    });
    (n.sections || []).forEach(function (s) {
      const h = sectionHeight(s);
      if (s.kind && n._anchors[s.kind] == null) n._anchors[s.kind] = y + h / 2;
      y += h;
    });
  }

  function attachY(node, edge, offset) {
    const inset = 12;
    let y = node._y + node._h / 2 + offset;
    if (edge && node._anchors && edge.kind && node._anchors[edge.kind] != null) {
      y = node._anchors[edge.kind] + offset;
    }
    return clamp(y, node._y + inset, node._y + node._h - inset);
  }

  function siblingOffset(edges, edge) {
    const sibs = edges.filter(function (e) {
      return e.from === edge.from && e.to === edge.to;
    });
    const i = sibs.findIndex(function (e) { return e.id === edge.id; });
    const n = sibs.length;
    if (n <= 1) return 0;
    return (i - (n - 1) / 2) * EDGE_FAN;
  }

  function spanBounds(a, b) {
    const left = Math.min(a._x, b._x) - 8;
    const right = Math.max(a._x + a._w, b._x + b._w) + 8;
    let minY = Math.min(a._y, b._y);
    let maxY = Math.max(a._y + a._h, b._y + b._h);
    graph.nodes.forEach(function (n) {
      if (n._x + n._w < left || n._x > right) return;
      minY = Math.min(minY, n._y);
      maxY = Math.max(maxY, n._y + n._h);
    });
    return { minY: minY, maxY: maxY };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function labelSize(lines) {
    const lineH = 12;
    const padX = 6;
    const padY = 3;
    const w = Math.max.apply(null, lines.map(function (l) { return l.length; })) * 6.1 + padX * 2;
    const h = lines.length * lineH + padY * 2;
    return { w: w, h: h, lineH: lineH, padX: padX, padY: padY };
  }

  function wrapToWidth(text, maxPx) {
    const chars = Math.max(12, Math.floor((maxPx - 12) / 6.1));
    return wrapLabel(text, chars);
  }

  function resolveLabel(lines, x, y, occupied) {
    const sz = labelSize(lines);
    const tries = [];
    [0, -14, 14, -28, 28, -44, 44, -62, 62, 80, -80].forEach(function (dy) {
      tries.push({ x: x, y: y + dy });
    });
    [-36, 36, -56, 56].forEach(function (dx) {
      tries.push({ x: x + dx, y: y });
      tries.push({ x: x + dx, y: y + 20 });
    });
    for (let i = 0; i < tries.length; i++) {
      const c = tries[i];
      const r = { x: c.x - sz.w / 2, y: c.y - sz.h / 2, w: sz.w, h: sz.h };
      let hit = false;
      for (let j = 0; j < occupied.length; j++) {
        if (rectsOverlap(r, occupied[j])) {
          hit = true;
          break;
        }
      }
      if (!hit) return { x: c.x, y: c.y, rect: r };
    }
    const fallback = { x: x, y: y + 96 };
    return {
      x: fallback.x,
      y: fallback.y,
      rect: { x: fallback.x - sz.w / 2, y: fallback.y - sz.h / 2, w: sz.w, h: sz.h },
    };
  }

  function edgeGeom(a, b, offset, edge) {
    const dx = b._x - a._x;
    const dy = (b._y + b._h / 2) - (a._y + a._h / 2);
    const sameCol = Math.abs(dx) < 12;
    if (sameCol) {
      const x = a._x + a._w / 2 + offset;
      const y1 = dy >= 0 ? a._y + a._h : a._y;
      const y2 = dy >= 0 ? b._y : b._y + b._h;
      return {
        d: "M " + x + " " + y1 + " L " + x + " " + y2,
        lx: x + 16,
        ly: (y1 + y2) / 2,
        lane: STACK_GAP - 16,
      };
    }
    const forward = dx > 0;
    const x1 = forward ? a._x + a._w : a._x;
    const x2 = forward ? b._x : b._x + b._w;
    const y1 = attachY(a, edge, offset);
    const y2 = attachY(b, edge, offset);
    if (forward) {
      const gutter = (x1 + x2) / 2 + offset;
      const lane = Math.abs(x2 - x1);
      return {
        d: "M " + x1 + " " + y1 + " L " + gutter + " " + y1 + " L " + gutter + " " + y2 + " L " + x2 + " " + y2,
        lx: gutter,
        ly: y1 === y2 ? y1 - 14 : (y1 + y2) / 2,
        lane: lane,
      };
    }
    const span = spanBounds(a, b);
    const around = (edge && edge.kind === "control")
      ? span.maxY + REVERSE_CLEAR + Math.abs(offset)
      : span.minY - TOP_CLEAR - Math.abs(offset);
    const out = x1 - 24;
    const inn = x2 + 24;
    const below = edge && edge.kind === "control";
    return {
      d: "M " + x1 + " " + y1 + " L " + out + " " + y1 + " L " + out + " " + around + " L " + inn + " " + around + " L " + inn + " " + y2 + " L " + x2 + " " + y2,
      lx: (out + inn) / 2,
      ly: below ? around + 18 : around - 18,
      lane: Math.abs(inn - out),
    };
  }

  function addEdgeLabel(parent, ns, lines, x, y) {
    if (!lines.length) return;
    const sz = labelSize(lines);
    const gEl = document.createElementNS(ns, "g");
    gEl.setAttribute("class", "edge-label-group");
    const bg = document.createElementNS(ns, "rect");
    bg.setAttribute("class", "edge-label-bg");
    bg.setAttribute("x", String(x - sz.w / 2));
    bg.setAttribute("y", String(y - sz.h / 2));
    bg.setAttribute("width", String(sz.w));
    bg.setAttribute("height", String(sz.h));
    bg.setAttribute("rx", "4");
    gEl.appendChild(bg);
    lines.forEach(function (line, i) {
      const t = document.createElementNS(ns, "text");
      t.setAttribute("class", "edge-label");
      t.setAttribute("x", String(x));
      t.setAttribute("y", String(y - sz.h / 2 + sz.padY + sz.lineH * (i + 0.78)));
      t.setAttribute("text-anchor", "middle");
      t.textContent = line;
      gEl.appendChild(t);
    });
    parent.appendChild(gEl);
  }

  function applyView() {
    viewport.setAttribute(
      "transform",
      `translate(${view.x} ${view.y}) scale(${view.k})`
    );
  }

  function connectedIds(id) {
    const ids = new Set([id]);
    graph.edges.forEach(function (e) {
      if (e.from === id) ids.add(e.to);
      if (e.to === id) ids.add(e.from);
    });
    return ids;
  }

  function renderGraph() {
    viewport.innerHTML = "";
    const ns = "http://www.w3.org/2000/svg";
    gridBg.setAttribute("width", String(Math.max(graph._width + 1200, 2800)));
    gridBg.setAttribute("height", String(Math.max(graph._height + 1200, 2000)));

    graph._bands.forEach(function (band) {
      if (!band.label) return;
      const t = document.createElementNS(ns, "text");
      t.setAttribute("class", "band-label");
      if (graph._landscape) {
        t.setAttribute("x", String(band._x));
        t.setAttribute("y", String(band._y));
      } else {
        t.setAttribute("x", "16");
        t.setAttribute("y", String(band._y));
      }
      t.textContent = band.label;
      viewport.appendChild(t);
    });

    const liveSet = selectedId ? connectedIds(selectedId) : null;
    const occupied = graph.nodes.map(function (n) {
      return {
        x: n._x - LABEL_PAD,
        y: n._y - LABEL_PAD,
        w: n._w + LABEL_PAD * 2,
        h: n._h + LABEL_PAD * 2,
      };
    });
    graph._bands.forEach(function (band) {
      if (!band.label || !graph._landscape) return;
      occupied.push({ x: band._x - 4, y: band._y - 16, w: 160, h: 22 });
    });
    const pendingLabels = [];

    graph.edges.forEach(function (edge) {
      const a = graph.nodes.find(function (n) { return n.id === edge.from; });
      const b = graph.nodes.find(function (n) { return n.id === edge.to; });
      if (!a || !b) return;
      const dim = liveSet && !liveSet.has(edge.from) && !liveSet.has(edge.to);
      const geom = edgeGeom(a, b, siblingOffset(graph.edges, edge), edge);
      const wrap = document.createElementNS(ns, "g");
      wrap.setAttribute("class", "edge-wrap" + (dim ? " dim" : ""));
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", geom.d);
      path.setAttribute("class", "edge " + edge.kind);
      path.setAttribute("marker-end", MARKER[edge.kind] || MARKER.control);
      path.dataset.id = edge.id;
      wrap.appendChild(path);
      viewport.appendChild(wrap);
      if (edge.label) {
        pendingLabels.push({
          dim: dim,
          lines: wrapToWidth(edge.label, Math.max(120, (geom.lane || GAP_COL) - 24)),
          x: geom.lx,
          y: geom.ly,
        });
      }
    });

    graph.nodes.forEach(function (node) {
      const gEl = document.createElementNS(ns, "g");
      let cls = "node";
      if (selectedId === node.id) cls += " selected";
      else if (liveSet && !liveSet.has(node.id)) cls += " dim";
      gEl.setAttribute("class", cls);
      gEl.dataset.id = node.id;
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("class", "node-body");
      rect.setAttribute("x", String(node._x));
      rect.setAttribute("y", String(node._y));
      rect.setAttribute("width", String(node._w));
      rect.setAttribute("height", String(node._h));
      rect.setAttribute("rx", "12");
      gEl.appendChild(rect);
      const bullets = node.bullets || [];
      const sections = node.sections || [];
      const isPacked = packed(node);
      if (isPacked) gEl.classList.add("packed");
      const text = document.createElementNS(ns, "text");
      text.setAttribute("class", "node-label");
      if (isPacked) {
        let y = node._y + 22;
        text.setAttribute("x", String(node._x + 12));
        text.setAttribute("y", String(y));
        text.textContent = node.label;
        gEl.appendChild(text);
        if (node.subtitle) {
          y += 15;
          const sub = document.createElementNS(ns, "text");
          sub.setAttribute("class", "node-sub");
          sub.setAttribute("x", String(node._x + 12));
          sub.setAttribute("y", String(y));
          sub.textContent = node.subtitle;
          gEl.appendChild(sub);
        }
        y = node._y + packedBodyTop(node);
        bullets.forEach(function (b) {
          wrapLabel(b, 38).forEach(function (line) {
            const bt = document.createElementNS(ns, "text");
            bt.setAttribute("class", "node-bullet");
            bt.setAttribute("x", String(node._x + 12));
            bt.setAttribute("y", String(y));
            bt.textContent = line;
            gEl.appendChild(bt);
            y += BULLET_H;
          });
        });
        sections.forEach(function (sec) {
          const start = y;
          const h = sectionHeight(sec);
          const bar = document.createElementNS(ns, "rect");
          bar.setAttribute("class", "section-bar" + (sec.kind ? " " + sec.kind : ""));
          bar.setAttribute("x", String(node._x + 8));
          bar.setAttribute("y", String(start + 6));
          bar.setAttribute("width", "3");
          bar.setAttribute("height", String(Math.max(8, h - 12)));
          bar.setAttribute("rx", "1");
          gEl.appendChild(bar);
          y = start + 24;
          const st = document.createElementNS(ns, "text");
          st.setAttribute("class", "section-title");
          st.setAttribute("x", String(node._x + 16));
          st.setAttribute("y", String(y));
          st.textContent = sec.title;
          gEl.appendChild(st);
          (sec.bullets || []).forEach(function (b) {
            wrapLabel(b, 36).forEach(function (line) {
              y += BULLET_H;
              const bt = document.createElementNS(ns, "text");
              bt.setAttribute("class", "node-bullet");
              bt.setAttribute("x", String(node._x + 16));
              bt.setAttribute("y", String(y));
              bt.textContent = line;
              gEl.appendChild(bt);
            });
          });
          y = start + h;
        });
      } else {
        text.setAttribute("x", String(node._x + node._w / 2));
        text.setAttribute("y", String(node._y + node._h / 2 + 4));
        text.textContent = node.label;
        gEl.appendChild(text);
      }
      gEl.addEventListener("click", function (ev) {
        ev.stopPropagation();
        selectNode(node.id);
      });
      viewport.appendChild(gEl);
    });

    (graph.annotations || []).forEach(function (_text, i) {
      occupied.push({
        x: PAD + i * (ANN_W + 16) - 8,
        y: graph._annY - 8,
        w: ANN_W + 16,
        h: 80,
      });
    });
    pendingLabels.forEach(function (item) {
      const pos = resolveLabel(item.lines, item.x, item.y, occupied);
      occupied.push(pos.rect);
      const layer = document.createElementNS(ns, "g");
      if (item.dim) layer.setAttribute("class", "edge-label-group dim");
      addEdgeLabel(layer, ns, item.lines, pos.x, pos.y);
      viewport.appendChild(layer);
    });

    (graph.annotations || []).forEach(function (text, i) {
      const x = PAD + i * (ANN_W + 16);
      const y = graph._annY;
      const gEl = document.createElementNS(ns, "g");
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("class", "annotation");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(ANN_W));
      rect.setAttribute("height", "64");
      rect.setAttribute("rx", "8");
      gEl.appendChild(rect);
      wrapLabel(text, 38).forEach(function (line, li) {
        const t = document.createElementNS(ns, "text");
        t.setAttribute("class", "annotation-text");
        t.setAttribute("x", String(x + 12));
        t.setAttribute("y", String(y + 22 + li * 14));
        t.textContent = line;
        gEl.appendChild(t);
      });
      viewport.appendChild(gEl);
    });
    applyView();
  }

  function threadKey(nodeId) {
    return nodeId || "_all";
  }

  function currentNode() {
    if (!graph || !selectedId) return null;
    return graph.nodes.find(function (n) { return n.id === selectedId; }) || null;
  }

  function renderEvidence(node) {
    panelEvidence.innerHTML = "";
    if (!node || !node.evidence) return;
    node.evidence.forEach(function (ev) {
      const li = document.createElement("li");
      let label = ev.path;
      if (ev.start_line) {
        label += ":" + ev.start_line;
        if (ev.end_line && ev.end_line !== ev.start_line) label += "–" + ev.end_line;
      }
      li.textContent = label;
      panelEvidence.appendChild(li);
    });
  }

  function renderThread() {
    const items = threads[threadKey(selectedId)] || [];
    thread.innerHTML = "";
    items.forEach(function (item) {
      const el = document.createElement("div");
      el.className = "msg " + (item.who || "agent") + (item.unknown ? " unknown" : "");
      const who = document.createElement("div");
      who.className = "who";
      who.textContent = item.who === "user" ? "You" : item.who === "status" ? "Agent" : "Answer";
      el.appendChild(who);
      if (item.who === "status") {
        const chips = document.createElement("div");
        chips.className = "chips";
        (item.chips || []).forEach(function (c) {
          const chip = document.createElement("span");
          chip.className = "chip tool" + (c.live ? " shimmer" : "");
          chip.textContent = c.detail ? c.label + " " + c.detail : c.label;
          chips.appendChild(chip);
        });
        el.appendChild(chips);
      } else {
        const body = document.createElement("div");
        body.className = "body";
        body.innerHTML = item.who === "user" ? "<p>" + escapeHtml(item.text) + "</p>" : renderMarkdown(item.markdown || item.text || "");
        el.appendChild(body);
      }
      if (item.citations && item.citations.length) {
        const ul = document.createElement("ul");
        ul.className = "citations";
        item.citations.forEach(function (c) {
          const li = document.createElement("li");
          li.textContent = c.path + (c.start_line ? ":" + c.start_line : "");
          ul.appendChild(li);
        });
        el.appendChild(ul);
      }
      if (item.follow_ups && item.follow_ups.length) {
        const chips = document.createElement("div");
        chips.className = "chips";
        item.follow_ups.forEach(function (q) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "chip follow";
          btn.textContent = q;
          btn.addEventListener("click", function () {
            askInput.value = q;
            submitAsk();
          });
          chips.appendChild(btn);
        });
        el.appendChild(chips);
      }
      thread.appendChild(el);
    });
    thread.scrollTop = thread.scrollHeight;
  }

  function selectNode(id) {
    selectedId = id;
    const node = currentNode();
    if (node) {
      panelEyebrow.textContent = "Component";
      panelTitle.textContent = node.label;
      panelRole.textContent = node.role;
      composerHint.textContent = "Scoped to " + node.label;
    } else {
      panelEyebrow.textContent = "Whole change";
      panelTitle.textContent = (graph && graph.title) || "Ask about this PR";
      if (graph && graph.summary) {
        panelRole.textContent = graph.summary.problem + "\n\n" + graph.summary.change;
      } else {
        panelRole.textContent = graph
          ? "Click a component to inspect it, or ask about the merged end state."
          : "";
      }
      composerHint.textContent = "";
    }
    renderEvidence(node);
    renderGraph();
    renderThread();
  }

  function record(nodeId, item) {
    const key = threadKey(nodeId);
    if (!threads[key]) threads[key] = [];
    threads[key].push(item);
    if (threadKey(selectedId) === key) renderThread();
  }

  function findStatus(askId, nodeId) {
    const list = threads[threadKey(nodeId)] || [];
    return list.find(function (item) {
      return item.who === "status" && item.ask_id === askId;
    });
  }

  async function submitAsk(ev) {
    if (ev) ev.preventDefault();
    const text = askInput.value.trim();
    if (!text || !live) return;
    btnSend.disabled = true;
    const nodeId = selectedId;
    let askId;
    try {
      const res = await fetch("/ui/ask", {
        method: "POST",
        credentials: "same-origin",
        headers: headers(),
        body: JSON.stringify({ node_id: nodeId, text: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ask failed");
      askId = data.ask_id;
    } catch (err) {
      record(nodeId, { who: "agent", markdown: String(err.message || err), unknown: true });
      btnSend.disabled = false;
      return;
    }
    askInput.value = "";
    pendingAsk = { ask_id: askId, node_id: nodeId };
    record(nodeId, { who: "user", text: text });
    record(nodeId, {
      who: "status",
      ask_id: askId,
      chips: [{ label: "Thinking", live: true }],
    });
  }

  function onStatus(data) {
    const nodeId = pendingAsk && pendingAsk.ask_id === data.ask_id ? pendingAsk.node_id : selectedId;
    let row = findStatus(data.ask_id, nodeId);
    if (!row) {
      record(nodeId, { who: "status", ask_id: data.ask_id, chips: [] });
      row = findStatus(data.ask_id, nodeId);
    }
    if (!row.chips) row.chips = [];
    row.chips = row.chips.filter(function (c) { return !c.live || c.label !== "Thinking"; });
    row.chips.push({
      label: data.label,
      detail: data.detail,
      live: data.kind !== "text",
    });
    renderThread();
  }

  function onAnswer(data) {
    const nodeId = pendingAsk && pendingAsk.ask_id === data.ask_id ? pendingAsk.node_id : selectedId;
    const row = findStatus(data.ask_id, nodeId);
    if (row && row.chips) {
      row.chips.forEach(function (c) { c.live = false; });
    }
    record(nodeId, {
      who: "agent",
      markdown: data.markdown,
      citations: data.citations || [],
      follow_ups: data.follow_ups || [],
      unknown: !!data.unknown,
    });
    if (pendingAsk && pendingAsk.ask_id === data.ask_id) pendingAsk = null;
    btnSend.disabled = false;
    askInput.focus();
  }

  function connectEvents() {
    const src = new EventSource("/ui/events");
    src.addEventListener("hello", function () {
      live = true;
      setConn("live", "Harness live");
      btnSend.disabled = false;
    });
    src.addEventListener("status", function (ev) {
      try { onStatus(JSON.parse(ev.data)); } catch (e) { /* ignore */ }
    });
    src.addEventListener("answer", function (ev) {
      try { onAnswer(JSON.parse(ev.data)); } catch (e) { /* ignore */ }
    });
    src.addEventListener("graph", function () {
      fetch("/graph.json", { credentials: "same-origin", headers: headers() })
        .then(function (res) { return res.json(); })
        .then(applyGraph)
        .catch(function () { /* keep the current graph */ });
    });
    src.addEventListener("shutdown", function () {
      live = false;
      setConn("dead", "Disconnected");
      btnSend.disabled = true;
      src.close();
    });
    src.onerror = function () {
      if (!live) setConn("wait", "Reconnecting");
    };
  }

  async function heartbeat() {
    if (!live && conn.textContent === "Disconnected") return;
    try {
      await fetch("/ui/heartbeat", {
        method: "POST",
        credentials: "same-origin",
        headers: headers(),
        body: "{}",
      });
    } catch (e) {
      /* ignore; EventSource owns connection display */
    }
  }

  svg.addEventListener("click", function (ev) {
    if (ev.target === svg || ev.target === gridBg) selectNode(null);
  });

  svg.addEventListener("pointerdown", function (ev) {
    if (ev.target.closest && ev.target.closest(".node")) return;
    dragging = true;
    lastPtr = { x: ev.clientX, y: ev.clientY };
    svg.classList.add("dragging");
    svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener("pointermove", function (ev) {
    if (!dragging || !lastPtr) return;
    view.x += ev.clientX - lastPtr.x;
    view.y += ev.clientY - lastPtr.y;
    lastPtr = { x: ev.clientX, y: ev.clientY };
    applyView();
  });
  svg.addEventListener("pointerup", function () {
    dragging = false;
    lastPtr = null;
    svg.classList.remove("dragging");
  });
  svg.addEventListener("wheel", function (ev) {
    ev.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const factor = ev.deltaY < 0 ? 1.08 : 0.92;
    const next = Math.min(2.4, Math.max(0.35, view.k * factor));
    const k = next / view.k;
    view.x = mx - (mx - view.x) * k;
    view.y = my - (my - view.y) * k;
    view.k = next;
    applyView();
  }, { passive: false });

  composer.addEventListener("submit", submitAsk);
  askInput.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter" || ev.shiftKey || ev.isComposing) return;
    ev.preventDefault();
    submitAsk(ev);
  });
  btnStop.addEventListener("click", async function () {
    await fetch("/ui/stop", { method: "POST", credentials: "same-origin", headers: headers(), body: "{}" });
  });

  function applyGraph(data) {
    graph = data;
    layout(graph);
    document.title = graph.title || "Interactive review";
    figureTitle.textContent = graph.title || "Interactive review";
    if (summaryEl && summaryProblem && summaryChange) {
      if (graph.summary && graph.summary.problem && graph.summary.change) {
        summaryProblem.textContent = graph.summary.problem;
        summaryChange.textContent = graph.summary.change;
        summaryEl.hidden = false;
      } else {
        summaryEl.hidden = true;
      }
    }
    if (graph.pr && graph.pr.url) {
      const href = safeHttpUrl(graph.pr.url);
      if (href) {
        prLink.href = href;
        prLink.textContent = graph.pr.title ? ("#" + graph.pr.number + " · " + graph.pr.title) : href;
      }
    }
    const keep = selectedId && graph.nodes.some(function (n) { return n.id === selectedId; })
      ? selectedId
      : null;
    selectNode(keep);
  }

  fetch("/graph.json", { credentials: "same-origin", headers: headers() })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      applyGraph(data);
      if (window.location.search.indexOf("token=") !== -1) {
        history.replaceState({}, "", window.location.pathname);
      }
      connectEvents();
      heartbeat();
      setInterval(heartbeat, heartbeatMs);
    })
    .catch(function (err) {
      panelRole.textContent = "Failed to load graph: " + err;
      setConn("dead", "Failed");
    });
})();
