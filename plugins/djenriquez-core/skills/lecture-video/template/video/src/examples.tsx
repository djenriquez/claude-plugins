// Example scenes for the bundled narration.json. Each shows one animation pattern:
//
//   Intro    title reveal and a glowing takeaway badge
//   Flow     a request packet travelling down through layers and a reply coming back
//   Failure  failure injection: a dependency turns red and shakes while the system keeps serving
//   Commit   sequence diagram: Prepare fan-out, Ready replies, Commit together
//   States   state machine with a token moving between states and locked terminal states
//   Roadmap  timeline that draws itself, one milestone per beat
//
// Beat index i in at(i) / lin(i, ...) / after(i) is the i-th sentence of the scene's narration.
import React from "react";
import { Arrow, C, Caption, Card, Icon, MONO, Packet, Pill, Reveal, SceneFrame, Svg, useScene } from "./lib";

type Pt = [number, number];

// ============ intro: title reveal ============
export const Intro: React.FC = () => {
  const { f, at, pop, after } = useScene();
  const topics = ["Request flow", "Failure modes", "Roadmap"];
  return (
    <SceneFrame>
      <div style={{ position: "absolute", top: 250, width: 1920, textAlign: "center" }}>
        <div style={{ fontSize: 40, letterSpacing: 10, color: C.blue, fontWeight: 700, opacity: at(0), transform: `translateY(${(1 - at(0)) * 30}px)` }}>
          ACME CHECKOUT
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 120,
            fontWeight: 850,
            letterSpacing: -3,
            backgroundImage: `linear-gradient(90deg, ${C.blue}, ${C.violet}, ${C.pink})`,
            WebkitBackgroundClip: "text",
            color: "transparent",
            opacity: at(1),
            transform: `scale(${0.85 + 0.15 * at(1)})`,
          }}
        >
          How an order flows
        </div>
        <div style={{ marginTop: 34, display: "flex", gap: 22, justifyContent: "center" }}>
          {topics.map((t, i) => (
            <span key={t} style={{ opacity: at(2, i * 10), transform: `translateY(${(1 - at(2, i * 10)) * 20}px)` }}>
              <Pill color={[C.blue, C.red, C.green][i]} size={32}>
                {t}
              </Pill>
            </span>
          ))}
        </div>
      </div>
      {after(3) && (
        <div style={{ position: "absolute", left: 960, top: 800, transform: `translate(-50%,-50%) scale(${pop(3, 10)})` }}>
          <div
            style={{
              padding: "26px 54px",
              borderRadius: 999,
              fontSize: 40,
              fontWeight: 750,
              background: `radial-gradient(circle, ${C.violet}55, ${C.blue}22)`,
              border: `3px solid ${C.violet}`,
              boxShadow: `0 0 ${60 + Math.sin(f / 8) * 20}px ${C.violet}`,
            }}
          >
            One clear mental model
          </div>
        </div>
      )}
    </SceneFrame>
  );
};

// ============ flow: packet through layers ============
export const Flow: React.FC = () => {
  const { at, lin, after, beat } = useScene();
  const cur = beat();
  const rows = [
    { name: "Client", sub: "browser or app", chips: [], color: C.blue, beat: 0 },
    { name: "API gateway", sub: "who are you?", chips: ["auth", "rate limit"], color: C.violet, beat: 1 },
    { name: "Order service", sub: "is the cart valid?", chips: ["validate cart", "reserve stock"], color: C.green, beat: 2 },
    { name: "Database", sub: "write it down", chips: ["orders table", "idempotency key"], color: C.amber, beat: 3 },
  ];
  const rowY = (k: number) => 250 + k * 170;
  const mid = (k: number) => rowY(k) + 65;
  const down: Pt[] = rows.map((_, k) => [1420, mid(k)]);
  const up: Pt[] = [...down].reverse().map(([, y]) => [1480, y]);
  const steps = ["① request", "② authenticated", "③ stock reserved", "④ written once"];
  return (
    <SceneFrame kicker="Part 1" title="The path of a request">
      {rows.map((r, k) => (
        <Reveal key={r.name} x={110} y={rowY(k)} w={1700} h={130} p={at(r.beat)} from="left">
          <div
            style={{
              height: "100%",
              borderRadius: 20,
              border: `2px solid ${r.color}`,
              background: `linear-gradient(90deg, ${r.color}30, ${r.color}08)`,
              display: "flex",
              alignItems: "center",
              padding: "0 30px",
              gap: 18,
              boxShadow: cur === r.beat && cur < 4 ? `0 0 40px ${r.color}88` : "none",
            }}
          >
            <div style={{ width: 340 }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: r.color }}>{r.name}</div>
              <div style={{ fontSize: 22, color: C.dim }}>{r.sub}</div>
            </div>
            {r.chips.map((c, i) => (
              <span key={c} style={{ opacity: at(r.beat, 10 + i * 6) }}>
                <Pill color={r.color} size={25}>
                  {c}
                </Pill>
              </span>
            ))}
          </div>
        </Reveal>
      ))}
      <Svg>
        <Arrow pts={down} p={lin(4, 90, 5)} color={C.amber} width={3} dashed />
        <Packet pts={down} t={lin(4, 90, 5)} color={C.amber} />
        <Arrow pts={up} p={lin(4, 45, 100)} color={C.cyan} width={3} dashed />
        <Packet pts={up} t={lin(4, 45, 100)} color={C.cyan} />
      </Svg>
      {after(4) &&
        steps.map((s, k) => (
          <div key={s} style={{ position: "absolute", left: 1530, top: mid(k) - 22, opacity: at(4, 5 + k * 30) }}>
            <Pill color={C.amber} size={22} style={{ background: "#0a0f1ecc" }}>
              {s}
            </Pill>
          </div>
        ))}
      <Caption p={at(4, 140)} color={C.cyan}>
        ⑤ Confirmation flows back up to the client
      </Caption>
    </SceneFrame>
  );
};

// ============ failure: failure injection ============
export const Failure: React.FC = () => {
  const { f, at, pop, after, beat, shake } = useScene();
  const cur = beat();
  const deps = [
    { name: "Cache", icon: "bolt", healthy: "fast reads", degraded: "down" },
    { name: "DB replica", icon: "db", healthy: "read copy", degraded: "down" },
    { name: "Payment provider", icon: "card", healthy: "charges cards", degraded: "timed out" },
  ];
  const depX = (i: number) => 170 + i * 570;
  const service: Pt = [960, 370];
  const link = (i: number): Pt[] => [service, [depX(i) + 220, 520]];
  const captions = [
    "",
    "Cache down → slower reads, every order still succeeds",
    "Replica down → the primary keeps taking writes",
    "Payment timeout → the charge queues and retries",
  ];
  const queued = after(3, 20) && !after(3, 150);
  return (
    <SceneFrame kicker="Part 2" title="Failures stay contained">
      <Reveal x={760} y={250} w={400} h={120} p={at(0, 5)} from="scale">
        <Card color={C.green} center icon={<Icon name="server" color={C.green} size={40} />} title={<span style={{ fontSize: 30 }}>Order service</span>} glow={cur > 0 ? 0.6 : 0} style={{ padding: 10 }} />
      </Reveal>
      <Svg>
        {deps.map((_, i) => {
          const down = cur === i + 1;
          return (
            <React.Fragment key={i}>
              <Arrow pts={link(i)} p={at(0, 10 + i * 5)} color={down ? C.red : C.faint} dashed />
              {!down && after(0, 30) && [0, 1].map((k) => <Packet key={k} pts={link(i)} t={((f + k * 25 + i * 11) % 50) / 50} color={C.cyan} r={7} />)}
            </React.Fragment>
          );
        })}
      </Svg>
      {deps.map((d, i) => {
        const down = cur === i + 1;
        const color = down ? C.red : C.green;
        return (
          <Reveal key={d.name} x={depX(i)} y={520} w={440} h={240} p={at(0, 15 + i * 6)}>
            <div style={{ height: "100%", transform: `translateX(${shake(down, i + 1)}px)`, opacity: down ? 0.85 : 1 }}>
              <Card color={color} icon={<Icon name={down ? "x" : d.icon} color={color} size={48} />} title={d.name} glow={down ? 1 : 0}>
                <div style={{ fontSize: 26, fontWeight: 700, color: down ? C.red : C.dim }}>{down ? d.degraded : d.healthy}</div>
              </Card>
            </div>
          </Reveal>
        );
      })}
      {cur > 0 && (
        <div style={{ position: "absolute", left: 1190, top: 287, opacity: at(1, 20) }}>
          <Pill color={C.green} size={24}>
            orders still flowing ✓
          </Pill>
        </div>
      )}
      {/* retry queue under the payment provider during beat 3, then the drained result */}
      {after(3, 20) && (
        <div style={{ position: "absolute", left: depX(2), top: 785, width: 440, display: "flex", justifyContent: "center", gap: 10 }}>
          {queued ? (
            [0, 1, 2].map((k) => (
              <div key={k} style={{ opacity: at(3, 20 + k * 12), transform: `translateY(${(1 - at(3, 20 + k * 12)) * 30}px)` }}>
                <Pill color={C.amber} size={18}>
                  retry
                </Pill>
              </div>
            ))
          ) : (
            <span style={{ transform: `scale(${pop(3, 150)})` }}>
              <Pill color={C.green} size={22}>
                charge retried ✓
              </Pill>
            </span>
          )}
        </div>
      )}
      {cur > 0 && (
        <Caption key={cur} p={at(cur, 10)} color={C.green}>
          {captions[cur]}
        </Caption>
      )}
    </SceneFrame>
  );
};

// ============ commit: sequence diagram ============
export const Commit: React.FC = () => {
  const { at, lin, after } = useScene();
  const cols = [
    { x: 300, name: "Coordinator", color: C.violet },
    { x: 900, name: "Inventory", color: C.amber },
    { x: 1250, name: "Payments", color: C.amber },
    { x: 1600, name: "Shipping", color: C.amber },
  ];
  const parts = [1, 2, 3];
  const committed = after(3, 80);
  return (
    <SceneFrame kicker="Part 3" title="Agreeing across services">
      {cols.map((c, i) => {
        const isPart = parts.includes(i);
        const color = isPart && committed ? C.green : c.color;
        return (
          <React.Fragment key={c.name}>
            <div style={{ position: "absolute", left: c.x - 130, top: 250, width: 260, height: 90, opacity: at(0, i * 5) }}>
              <Card color={color} center title={<span style={{ fontSize: 28 }}>{c.name}</span>} style={{ padding: 6 }} glow={isPart && committed ? 0.8 : 0} />
            </div>
            <div style={{ position: "absolute", left: c.x - 1, top: 340, width: 2, height: 560, background: C.faint, opacity: at(0, i * 5) }} />
            {isPart && after(2) && (
              <div style={{ position: "absolute", left: c.x - 125, top: 520, width: 250, fontSize: 22, lineHeight: 1.55, padding: "10px 14px", borderRadius: 14, background: "#0a0f1ecc", border: `2px solid ${C.amber}`, opacity: at(2, (i - 1) * 6) }}>
                <div>✓ resources held</div>
                <div style={{ opacity: at(2, 15 + (i - 1) * 6) }}>✓ ready to go</div>
                <div style={{ color: C.dim, opacity: at(2, 30) }}>✗ nothing committed</div>
              </div>
            )}
          </React.Fragment>
        );
      })}
      <Svg>
        {parts.map((w, k) => (
          <Arrow key={w} pts={[[300, 400 + k * 30], [cols[w].x, 400 + k * 30]]} p={lin(1, 35, k * 5)} color={C.amber} label={k === 0 ? "Prepare" : undefined} labelAt={[600, 388]} />
        ))}
        {parts.map((w, k) => (
          <Arrow key={`r${w}`} pts={[[cols[w].x, 700 + k * 25], [300, 700 + k * 25]]} p={lin(3, 30, k * 8)} color={C.amber} dashed label={k === 0 ? "Ready" : undefined} labelAt={[600, 688]} />
        ))}
        {parts.map((w, k) => (
          <Arrow key={`c${w}`} pts={[[300, 800 + k * 22], [cols[w].x, 800 + k * 22]]} p={lin(3, 30, 50)} color={C.green} width={5} label={k === 0 ? "Commit (all together)" : undefined} labelAt={[600, 788]} />
        ))}
      </Svg>
      <Caption p={at(4)} color={C.red}>
        Any “no” → everyone aborts. Nothing is half done.
      </Caption>
    </SceneFrame>
  );
};

// ============ states: state machine ============
export const States: React.FC = () => {
  const { at, pop, lin, after } = useScene();
  const S = {
    pending: { x: 300, y: 520, color: C.blue },
    paid: { x: 760, y: 520, color: C.violet },
    shipped: { x: 1220, y: 520, color: C.amber },
    delivered: { x: 1640, y: 520, color: C.green },
    cancelled: { x: 530, y: 800, color: C.red },
  };
  type Key = keyof typeof S;
  const path: Key[] = ["pending", "paid", "shipped", "delivered"];
  const pts: Pt[] = path.map((k) => [S[k].x, S[k].y]);
  // token: pending → paid during beat 1, paid → delivered during beat 2
  const t = lin(1, 40, 50) / 3 + (lin(2, 90, 10) * 2) / 3;
  const active: Key | null = !after(1) ? null : path[Math.min(3, Math.round(t * 3))];
  const terminal = (k: Key) => k === "delivered" || k === "cancelled";
  const node = (k: Key, p: number) => {
    const s = S[k];
    const lit = active === k || (after(4) && terminal(k));
    return (
      <div
        key={k}
        style={{
          position: "absolute",
          left: s.x - 140,
          top: s.y - 45,
          width: 280,
          height: 90,
          transform: `scale(${p})`,
          borderRadius: 20,
          border: `${terminal(k) ? 5 : 3}px ${terminal(k) ? "double" : "solid"} ${s.color}`,
          // solid base layer so the token hides behind nodes
          background: `linear-gradient(${s.color}${lit ? "55" : "22"}, ${s.color}${lit ? "55" : "22"}), ${C.bg}`,
          boxShadow: lit ? `0 0 40px ${s.color}` : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: MONO,
          fontSize: 28,
          fontWeight: 700,
        }}
      >
        {k.toUpperCase()}
      </div>
    );
  };
  return (
    <SceneFrame kicker="Part 4" title="The life of an order">
      <Svg>
        <Arrow pts={[[440, 520], [620, 520]]} p={lin(1, 20, 20)} color={C.violet} />
        <Arrow pts={[[900, 520], [1080, 520]]} p={lin(2, 20)} color={C.amber} />
        <Arrow pts={[[1360, 520], [1500, 520]]} p={lin(2, 20, 45)} color={C.green} />
        <Arrow pts={[[300, 565], [450, 755]]} p={lin(3, 25, 10)} color={C.red} dashed />
        <Arrow pts={[[760, 565], [610, 755]]} p={lin(3, 25, 25)} color={C.red} dashed />
        <Packet pts={pts} t={after(1) ? Math.max(0.001, t) : 0} color="#fff" r={11} />
      </Svg>
      {node("pending", pop(0, 10))}
      {node("paid", pop(1, 10))}
      {node("shipped", pop(2, 5))}
      {node("delivered", pop(2, 40))}
      {node("cancelled", pop(3))}
      {after(3) && (
        <div style={{ position: "absolute", left: 830, top: 780, opacity: at(3, 30) }}>
          <Pill color={C.red} size={24}>
            only before shipping
          </Pill>
        </div>
      )}
      {after(4) &&
        (["delivered", "cancelled"] as Key[]).map((k, i) => (
          <div key={k} style={{ position: "absolute", left: S[k].x + (k === "delivered" ? 110 : 150), top: S[k].y + (k === "delivered" ? -80 : -22), transform: `scale(${pop(4, 10 + i * 10)})` }}>
            <Icon name="lock" color={S[k].color} size={44} />
          </div>
        ))}
      <Caption p={at(4, 30)} color={C.green}>
        Terminal states are final
      </Caption>
    </SceneFrame>
  );
};

// ============ roadmap: timeline ============
const MILESTONES = [
  ["Q1 2027", "Payments service", "split out of the monolith"],
  ["Q2 2027", "Second region", "checkout in two regions"],
  ["Q3 2027", "Order edits", "change an order after placing it"],
  ["Q4 2027", "Monolith retired", "last traffic moved"],
];

export const Roadmap: React.FC = () => {
  const { f, at, pop, lin, after } = useScene();
  const x = (k: number) => 330 + k * 420;
  return (
    <SceneFrame kicker="Part 5" title="Where this is headed">
      <Svg>
        <line x1={150} y1={580} x2={150 + 1620 * lin(0, 60, 20)} y2={580} stroke={C.blue} strokeWidth={6} strokeLinecap="round" />
      </Svg>
      {MILESTONES.map(([when, what, detail], k) => {
        const above = k % 2 === 0;
        const done = k === 3 && after(4);
        return (
          <React.Fragment key={when}>
            <div style={{ position: "absolute", left: x(k) - 22, top: 558, width: 44, height: 44, borderRadius: "50%", background: done ? C.green : C.blue, border: "5px solid #fff", transform: `scale(${pop(k + 1)})`, boxShadow: `0 0 30px ${done ? C.green : C.blue}` }} />
            <div style={{ position: "absolute", left: x(k) - 160, top: above ? 320 : 640, width: 320, height: 200, opacity: at(k + 1), transform: `translateY(${(1 - at(k + 1)) * (above ? -30 : 30)}px)` }}>
              <Card color={done ? C.green : C.blue} glow={done ? 0.6 : 0} style={{ padding: "18px 22px" }}>
                <div style={{ fontSize: 24, color: C.amber, fontWeight: 800 }}>{when}</div>
                <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.15 }}>{what}</div>
                <div style={{ fontSize: 22, color: C.dim }}>{detail}</div>
              </Card>
            </div>
          </React.Fragment>
        );
      })}
      {after(5) && (
        <div style={{ position: "absolute", left: 960, top: 940, transform: `translate(-50%,-50%) scale(${pop(5)})` }}>
          <div style={{ padding: "18px 44px", borderRadius: 999, fontSize: 36, fontWeight: 750, border: `3px solid ${C.violet}`, background: "#0a0f1ee6", boxShadow: `0 0 ${40 + Math.sin(f / 8) * 15}px ${C.violet}` }}>
            Thanks for watching!
          </div>
        </div>
      )}
    </SceneFrame>
  );
};
