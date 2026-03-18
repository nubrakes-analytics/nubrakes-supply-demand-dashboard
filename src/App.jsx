import { useState, useMemo, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, ComposedChart,
} from "recharts";

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = {
  bg: "#f1f5f9",
  surface: "#ffffff",
  panel: "#f8fafc",
  border: "#e5e7eb",
  primary: "#111827",
  secondary: "#374151",
  muted: "#6b7280",
  subtle: "#9ca3af",
  info: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  purple: "#8b5cf6",
  teal: "#14b8a6",
};

const STATUS_COLOR = {
  "Balanced": C.success,
  "Demand Constrained": C.warning,
  "Supply Constrained": C.danger,
  "Conversion Issue": C.purple,
  "Execution Issue": C.info,
};

const BASELINE_WEEKS = 12;

// ── Responsive hook ───────────────────────────────────────────────────────────
const useBreakpoint = () => {
  const [bp, setBp] = useState("desktop");

  useEffect(() => {
    const update = () => {
      if (window.innerWidth < 600) setBp("mobile");
      else if (window.innerWidth < 960) setBp("tablet");
      else setBp("desktop");
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return bp;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const num = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

const aggWeek = (rows) => {
  const r = {
    leads: 0,
    booked_jobs: 0,
    completed_jobs: 0,
    warranty_checks: 0,
    diagnostics: 0,
    service_calls: 0,
    utilized_slots: 0,
    techs: 0,
    slots: 0,
    rev_job_slots_available: 0,
  };

  if (!rows.length) return r;

  rows.forEach((d) => {
    r.leads += num(d.leads);
    r.booked_jobs += num(d.booked_jobs);
    r.completed_jobs += num(d.completed_jobs);
    r.warranty_checks += num(d.warranty_checks);
    r.diagnostics += num(d.diagnostics);
    r.service_calls += num(d.service_calls);
    r.utilized_slots += num(d.utilized_slots);
    r.slots += num(d.slots);
    r.rev_job_slots_available += num(d.rev_job_slots_available);
  });

  const mktMax = {};
  rows.forEach((d) => {
    const v = num(d.techs);
    mktMax[d.market] = Math.max(mktMax[d.market] || 0, v);
  });

  r.techs = Object.values(mktMax).reduce((a, b) => a + b, 0);
  return r;
};

const groupByWeek = (rows) => {
  const map = {};
  rows.forEach((d) => {
    const wk = String(d.week).slice(0, 10);
    if (!map[wk]) map[wk] = [];
    map[wk].push(d);
  });
  return map;
};

const getMonday = (dateStr) => {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
};

const pct = (a, b) => (b === 0 ? 0 : +((a / b) * 100).toFixed(1));

const derive = (agg) => ({
  ...agg,
  bookingRate: pct(agg.booked_jobs, agg.leads),
  convRate: pct(agg.completed_jobs, agg.leads),
  utilization: agg.slots > 0 ? pct(agg.utilized_slots, agg.slots) : 0,
  slotAvailPct: agg.slots > 0 ? pct(agg.rev_job_slots_available, agg.slots) : 0,
  lsr: agg.slots > 0 ? +(agg.leads / agg.slots).toFixed(1) : 0,
  jobsPerTech: agg.techs > 0 ? +(agg.completed_jobs / agg.techs).toFixed(1) : 0,
  nonRevPct:
    agg.utilized_slots > 0
      ? pct(agg.warranty_checks + agg.diagnostics + agg.service_calls, agg.utilized_slots)
      : 0,
  completionYield: agg.booked_jobs > 0 ? pct(agg.completed_jobs, agg.booked_jobs) : 0,
  revCapMix: agg.utilized_slots > 0 ? pct(agg.completed_jobs, agg.utilized_slots) : 0,
});

const buildBaselines = (allWeeks, pastWeeks, markets) => {
  const baselineWeekKeys = pastWeeks.slice(-(BASELINE_WEEKS + 1), -1);

  return markets.reduce((acc, market) => {
    const weeklyStats = baselineWeekKeys
      .map((wk) => {
        const rows = (allWeeks[wk] || []).filter((r) => r.market === market);
        const a = aggWeek(rows);
        return {
          leads: a.leads,
          bookRate: a.leads > 0 ? a.booked_jobs / a.leads : null,
          compRate: a.booked_jobs > 0 ? a.completed_jobs / a.booked_jobs : null,
          utilRate: a.slots > 0 ? a.utilized_slots / a.slots : null,
        };
      })
      .filter((w) => w.leads > 0);

    const avg = (arr, key) => {
      const vals = arr.map((w) => w[key]).filter((v) => v !== null && v !== undefined);
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };

    acc[market] = {
      avgLeads: avg(weeklyStats, "leads"),
      avgBookRate: avg(weeklyStats, "bookRate"),
      avgCompRate: avg(weeklyStats, "compRate"),
      avgUtilRate: avg(weeklyStats, "utilRate"),
      weeksUsed: weeklyStats.length,
    };

    return acc;
  }, {});
};

const variance = (current, baseline) => {
  if (baseline === null || baseline === 0) return null;
  return (current - baseline) / baseline;
};

const diagStatus = (m, baselines) => {
  const b = baselines[m.market];

  const curBookRate = m.leads > 0 ? m.booked_jobs / m.leads : 0;
  const curCompRate = m.booked_jobs > 0 ? m.completed_jobs / m.booked_jobs : 0;
  const curUtilRate = m.slots > 0 ? m.utilized_slots / m.slots : 0;

  if (m.leads < 10) return "Demand Constrained";

  if (!b || b.weeksUsed < 4) {
    if (curUtilRate > 0.90) return "Supply Constrained";
    if (curBookRate < 0.30) return "Conversion Issue";
    if (m.booked_jobs >= 10 && curCompRate < 0.80) return "Execution Issue";
    return "Balanced";
  }

  const vLeads = variance(m.leads, b.avgLeads);
  const vBookRate = variance(curBookRate, b.avgBookRate);
  const vCompRate = variance(curCompRate, b.avgCompRate);
  const vUtilRate = variance(curUtilRate, b.avgUtilRate);

  if (vUtilRate !== null && vUtilRate > 0.15 && curUtilRate > 0.85) return "Supply Constrained";
  if (vLeads !== null && vLeads < -0.20) return "Demand Constrained";
  if (vBookRate !== null && vBookRate < -0.15) return "Conversion Issue";
  if (m.booked_jobs >= 10 && vCompRate !== null && vCompRate < -0.15) return "Execution Issue";

  return "Balanced";
};

const diagAction = (s) =>
  ({
    "Demand Constrained": "Increase lead volume",
    "Conversion Issue": "Improve booking follow-up",
    "Supply Constrained": "Add slots / adjust staffing",
    "Execution Issue": "Investigate low completion yield",
    "Balanced": "Monitor — no immediate action",
  })[s];

// ── Small UI Helpers ──────────────────────────────────────────────────────────
const Spark = ({ data, color = C.info }) => (
  <ResponsiveContainer width={56} height={24}>
    <LineChart data={data}>
      <Line type="monotone" dataKey="v" dot={false} strokeWidth={1.5} stroke={color} />
    </LineChart>
  </ResponsiveContainer>
);

const Card = ({ children, style = {}, title }) => (
  <div
    style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: 16,
      boxShadow: "0 1px 3px rgba(0,0,0,.05)",
      ...style,
    }}
  >
    {title && (
      <h3
        style={{
          color: C.secondary,
          fontSize: 13,
          fontWeight: 700,
          marginTop: 0,
          marginBottom: 12,
        }}
      >
        {title}
      </h3>
    )}
    {children}
  </div>
);

const SectionHeader = ({ title, sub }) => (
  <div style={{ marginBottom: 16 }}>
    <h2 style={{ color: C.primary, fontSize: 16, fontWeight: 800, margin: 0 }}>{title}</h2>
    {sub && <p style={{ color: C.muted, fontSize: 11, margin: "3px 0 0" }}>{sub}</p>}
  </div>
);

const TT = ({ active, payload, label, showDelta = false }) => {
  if (!active || !payload?.length) return null;

  const cur = payload.find((p) => !String(p.dataKey).endsWith("_pw"));
  const prev = payload.find((p) => String(p.dataKey).endsWith("_pw"));
  const delta =
    cur && prev && prev.value !== 0
      ? +(((cur.value - prev.value) / prev.value) * 100).toFixed(1)
      : null;
  const absDelta = cur && prev ? +(cur.value - prev.value).toFixed(1) : null;

  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,.1)",
      }}
    >
      <p style={{ color: C.muted, margin: "0 0 4px", fontWeight: 600 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: "2px 0" }}>
          {p.name}: <b style={{ color: C.primary }}>{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</b>
        </p>
      ))}
      {showDelta && delta !== null && (
        <p
          style={{
            margin: "5px 0 0",
            borderTop: `1px solid ${C.border}`,
            paddingTop: 4,
            color: absDelta >= 0 ? C.success : C.danger,
            fontWeight: 700,
          }}
        >
          WoW: {absDelta >= 0 ? "+" : ""}
          {absDelta} ({delta >= 0 ? "+" : ""}
          {delta}%)
        </p>
      )}
    </div>
  );
};

const DeltaLabel = ({ x, y, width, value, data, dataKey, pwKey }) => {
  if (!data || value === undefined || value === null) return null;
  const row = data.find((d) => d[dataKey] === value);
  if (!row) return null;

  const prev = row[pwKey];
  if (!prev || prev === 0) return null;

  const p = +(((value - prev) / prev) * 100).toFixed(1);
  const up = p >= 0;

  return (
    <text
      x={x + width / 2}
      y={y - 3}
      textAnchor="middle"
      fontSize={8}
      fontWeight={700}
      fill={up ? C.success : C.danger}
    >
      {up ? "+" : ""}
      {p}%
    </text>
  );
};

const TABS = [
  { id: "scorecard", label: "Scorecard" },
  { id: "demand", label: "Demand" },
  { id: "capacity", label: "Capacity" },
  { id: "workmix", label: "Work Mix" },
  { id: "action", label: "Actions" },
];

const KPI_VALUE_FORMAT = (v, fmt) => {
  if (fmt === "%") return `${v.toFixed(1)}%`;
  if (fmt === "x") return `${v.toFixed(1)}x`;
  return Math.round(v).toLocaleString();
};

function KPICard({ label, cur, prev, fmt = "n", inv = false, isMobile = false, weekTrendData = [] }) {
  const d = fmt === "%" || fmt === "x" ? +(cur - prev).toFixed(1) : Math.round(cur - prev);
  const p = prev === 0 ? 0 : +(((cur - prev) / prev) * 100).toFixed(1);
  const up = d >= 0;
  const good = inv ? !up : up;
  const col = good ? C.success : C.danger;
  const bg = good ? "#d1fae5" : "#fee2e2";

  const sparkField = {
    "Leads": "leads",
    "Booking Rate": "bookRate",
    "Conversion Rate": "conv",
    "Utilization": "util",
    "LSR": "lsr",
    "Slots": "slots",
    "Completed Jobs": "completed",
  }[label];

  const sparkData = sparkField ? weekTrendData.map((w) => ({ v: w[sparkField] || 0 })) : [];

  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: isMobile ? "12px 14px" : "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        boxShadow: "0 1px 3px rgba(0,0,0,.06)",
      }}
    >
      <span
        style={{
          color: C.muted,
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: ".07em",
        }}
      >
        {label}
      </span>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <span style={{ color: C.primary, fontSize: isMobile ? 20 : 26, fontWeight: 800, lineHeight: 1 }}>
          {KPI_VALUE_FORMAT(cur, fmt)}
        </span>
        {!isMobile && sparkField && <Spark data={sparkData} />}
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{
            background: bg,
            color: col,
            fontSize: 10,
            fontWeight: 700,
            borderRadius: 4,
            padding: "2px 6px",
          }}
        >
          {up ? "+" : ""}
          {p}%
        </span>
        <span style={{ color: C.subtle, fontSize: 11 }}>
          {up ? "+" : ""}
          {KPI_VALUE_FORMAT(d, fmt)} vs prior
        </span>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("scorecard");
  const bp = useBreakpoint();

  useEffect(() => {
    fetch("https://raw.githubusercontent.com/nubrakes-analytics/NuBrakes-Copilot/1e0ec647dc2c42e08444361d8e26fd03816322d7/data/fact_nubrakes_supply_demand_daily.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load dataset: ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setRawData(Array.isArray(d) ? d : []);
      })
      .catch((err) => {
        console.error("fact_nubrakes_supply_demand_daily.json load failed", err);
        setRawData([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const derived = useMemo(() => {
    const RAW = rawData;

    if (!RAW.length) {
      return {
        CUR: derive(aggWeek([])),
        PREV: derive(aggWeek([])),
        CUR_WK: "",
        PREV_WK: "",
        curByMkt: [],
        prevByMkt: [],
        mktCompare: [],
        curByDow: [],
        weekTrendData: [],
        weekMixData: [],
        utilByMktCompare: [],
        actionTableData: [],
      };
    }

    const allWeeks = groupByWeek(RAW);
    const weekKeys = Object.keys(allWeeks).sort();

    const todayStr = new Date().toISOString().slice(0, 10);
    const thisWeekMonday = getMonday(todayStr);
    const pastWeeks = weekKeys.filter((k) => k < thisWeekMonday);

    const CUR_WK = pastWeeks[pastWeeks.length - 1] || weekKeys[weekKeys.length - 1];
    const PREV_WK = pastWeeks[pastWeeks.length - 2] || pastWeeks[0] || CUR_WK;

    const curRows = allWeeks[CUR_WK] || [];
    const prevRows = allWeeks[PREV_WK] || [];

    const CUR = derive(aggWeek(curRows));
    const PREV = derive(aggWeek(prevRows));

    const MARKETS = [...new Set(RAW.map((r) => r.market))].sort();

    const curByMkt = MARKETS.map((m) => ({
      market: m,
      ...derive(aggWeek(curRows.filter((r) => r.market === m))),
    }));

    const prevByMkt = MARKETS.map((m) => ({
      market: m,
      ...derive(aggWeek(prevRows.filter((r) => r.market === m))),
    }));

    const mktCompare = MARKETS.map((m) => {
      const c = curByMkt.find((r) => r.market === m);
      const p = prevByMkt.find((r) => r.market === m);

      return {
        market: m,
        leads: c?.leads || 0,
        leads_pw: p?.leads || 0,
        bookRate: c?.bookingRate || 0,
        bookRate_pw: p?.bookingRate || 0,
        conv: c?.convRate || 0,
        conv_pw: p?.convRate || 0,
        lsr: c?.lsr || 0,
        lsr_pw: p?.lsr || 0,
      };
    });

    const curByDow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dow) => {
      const cR = curRows.filter((r) => r.dow === dow);
      const pR = prevRows.filter((r) => r.dow === dow);
      const c = cR.length ? derive(aggWeek(cR)) : null;
      const p = pR.length ? derive(aggWeek(pR)) : null;

      return {
        day: dow,
        leads: c?.leads || 0,
        leads_pw: p?.leads || 0,
        bookRate: c?.bookingRate || 0,
        bookRate_pw: p?.bookingRate || 0,
        conv: c?.convRate || 0,
        conv_pw: p?.convRate || 0,
        lsr: c?.lsr || 0,
        lsr_pw: p?.lsr || 0,
        slots: c?.slots || 0,
        slots_pw: p?.slots || 0,
        techs: c?.techs || 0,
        techs_pw: p?.techs || 0,
        util: c?.utilization || 0,
        avail: c?.slotAvailPct || 0,
      };
    });

    const weekTrendData = weekKeys
      .filter((k) => k <= CUR_WK)
      .map((k) => {
        const rows = allWeeks[k];
        const a = derive(aggWeek(rows));

        const wdSlots = rows
          .filter((r) => ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(r.dow))
          .reduce((s, r) => s + num(r.slots), 0);

        const weSlots = rows
          .filter((r) => ["Sat", "Sun"].includes(r.dow))
          .reduce((s, r) => s + num(r.slots), 0);

        return {
          week: k.slice(5),
          leads: a.leads,
          bookRate: a.bookingRate,
          conv: a.convRate,
          lsr: a.lsr,
          util: a.utilization,
          slots: a.slots,
          completed: a.completed_jobs,
          wdSlots,
          weSlots,
        };
      });

    const weekMixData = weekKeys
      .filter((k) => k <= CUR_WK)
      .map((k) => {
        const a = aggWeek(allWeeks[k]);
        return {
          week: k.slice(5),
          completed: a.completed_jobs,
          warranty: a.warranty_checks,
          diagnostic: a.diagnostics,
          serviceCall: a.service_calls,
        };
      });

    const utilByMktCompare = curByMkt
      .filter((m) => m.slots > 0)
      .map((m) => {
        const p = prevByMkt.find((r) => r.market === m.market);
        return {
          market: m.market,
          util: m.utilization,
          util_pw: p?.utilization || 0,
        };
      });

    const marketBaselines = buildBaselines(allWeeks, pastWeeks, MARKETS);

    const actionTableData = curByMkt.map((m) => {
      const st = diagStatus(m, marketBaselines);
      return {
        ...m,
        status: st,
        action: diagAction(st),
        baseline: marketBaselines[m.market],
      };
    });

    return {
      CUR,
      PREV,
      CUR_WK,
      PREV_WK,
      curByMkt,
      prevByMkt,
      mktCompare,
      curByDow,
      weekTrendData,
      weekMixData,
      utilByMktCompare,
      actionTableData,
    };
  }, [rawData]);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        fontFamily: "Inter,system-ui,sans-serif",
        color: C.primary,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          padding: bp === "mobile" ? "12px 16px" : "16px 24px",
          boxShadow: "0 1px 3px rgba(0,0,0,.05)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: bp === "mobile" ? 15 : 18, fontWeight: 800 }}>
          Weekly Ops Dashboard
        </h1>
        <p style={{ margin: 0, fontSize: 11, color: C.muted }}>
          Week of {derived.CUR_WK || "-"} · vs {derived.PREV_WK || "-"}
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          overflowX: "auto",
          whiteSpace: "nowrap",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div style={{ display: "inline-flex", padding: `0 ${bp === "mobile" ? "12px" : "24px"}` }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: "transparent",
                color: tab === t.id ? C.info : C.muted,
                border: "none",
                borderBottom: `2px solid ${tab === t.id ? C.info : "transparent"}`,
                padding: bp === "mobile" ? "10px 12px" : "12px 18px",
                fontSize: bp === "mobile" ? 12 : 13,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: bp === "mobile" ? "14px" : "24px", maxWidth: 1400, margin: "0 auto" }}>
        {tab === "scorecard" && (
          <Scorecard
            bp={bp}
            CUR={derived.CUR}
            PREV={derived.PREV}
            weekTrendData={derived.weekTrendData}
            CUR_WK={derived.CUR_WK}
            PREV_WK={derived.PREV_WK}
          />
        )}

        {tab === "demand" && (
          <DemandReview
            bp={bp}
            CUR_WK={derived.CUR_WK}
            PREV_WK={derived.PREV_WK}
            curByDow={derived.curByDow}
            weekTrendData={derived.weekTrendData}
            mktCompare={derived.mktCompare}
          />
        )}

        {tab === "capacity" && (
          <CapacityReview
            bp={bp}
            CUR_WK={derived.CUR_WK}
            PREV_WK={derived.PREV_WK}
            curByDow={derived.curByDow}
            utilByMktCompare={derived.utilByMktCompare}
            weekTrendData={derived.weekTrendData}
          />
        )}

        {tab === "workmix" && (
          <WorkMix
            bp={bp}
            weekMixData={derived.weekMixData}
            curByMkt={derived.curByMkt}
          />
        )}

        {tab === "action" && (
          <ActionTable
            bp={bp}
            actionTableData={derived.actionTableData}
            CUR_WK={derived.CUR_WK}
          />
        )}
      </div>
    </div>
  );
}

// ── 1. SCORECARD ──────────────────────────────────────────────────────────────
function Scorecard({ bp, CUR, PREV, weekTrendData, CUR_WK, PREV_WK }) {
  const isMobile = bp === "mobile";
  const cols = isMobile ? 2 : bp === "tablet" ? 3 : 5;

  const kpis = [
    { label: "Leads", cur: CUR.leads, prev: PREV.leads, fmt: "n" },
    { label: "Booking Rate", cur: CUR.bookingRate, prev: PREV.bookingRate, fmt: "%" },
    { label: "Conversion Rate", cur: CUR.convRate, prev: PREV.convRate, fmt: "%" },
    { label: "Completed Jobs", cur: CUR.completed_jobs, prev: PREV.completed_jobs, fmt: "n" },
    { label: "Utilization", cur: CUR.utilization, prev: PREV.utilization, fmt: "%" },
    { label: "Techs", cur: CUR.techs, prev: PREV.techs, fmt: "n" },
    { label: "Slots", cur: CUR.slots, prev: PREV.slots, fmt: "n" },
    { label: "% Slots Avail", cur: CUR.slotAvailPct, prev: PREV.slotAvailPct, fmt: "%" },
    { label: "LSR", cur: CUR.lsr, prev: PREV.lsr, fmt: "x", inv: true },
  ];

  return (
    <div>
      <SectionHeader title="Weekly Scorecard" sub={`${CUR_WK} vs ${PREV_WK}`} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 10 }}>
        {kpis.map((k) => (
          <KPICard key={k.label} {...k} isMobile={isMobile} weekTrendData={weekTrendData} />
        ))}
      </div>
    </div>
  );
}

// ── 2. DEMAND ─────────────────────────────────────────────────────────────────
function DemandReview({ bp, CUR_WK, PREV_WK, curByDow, weekTrendData, mktCompare }) {
  const [metric, setMetric] = useState("leads");
  const isMobile = bp === "mobile";
  const cols = isMobile ? 1 : 2;
  const chartH = isMobile ? 180 : 200;

  const metricMap = {
    leads: "Leads",
    bookRate: "Bk Rate",
    conv: "Conv Rate",
    lsr: "LSR",
  };

  const metricPwMap = {
    leads: "leads_pw",
    bookRate: "bookRate_pw",
    conv: "conv_pw",
    lsr: "lsr_pw",
  };

  return (
    <div>
      <SectionHeader title="Demand Review" sub={`${CUR_WK} vs ${PREV_WK}`} />

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {Object.entries(metricMap).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setMetric(k)}
            style={{
              background: metric === k ? C.info : C.surface,
              color: metric === k ? "#fff" : C.muted,
              border: `1px solid ${metric === k ? C.info : C.border}`,
              borderRadius: 20,
              padding: "5px 14px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {v}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 14 }}>
        <Card title="Week in Review vs Prior Week by Day">
          <ResponsiveContainer width="100%" height={chartH}>
            <BarChart data={curByDow} margin={{ top: 16, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT showDelta={true} />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar
                dataKey={metric}
                fill={C.info}
                radius={[3, 3, 0, 0]}
                name={`${metricMap[metric]} (${String(CUR_WK).slice(5)})`}
                label={<DeltaLabel data={curByDow} dataKey={metric} pwKey={metricPwMap[metric]} />}
              />
              <Bar
                dataKey={metricPwMap[metric]}
                fill={C.subtle}
                radius={[3, 3, 0, 0]}
                name={`${metricMap[metric]} (${String(PREV_WK).slice(5)})`}
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Weekly Trend">
          <ResponsiveContainer width="100%" height={chartH}>
            <LineChart data={weekTrendData} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="week" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT />} />
              <Line
                type="monotone"
                dataKey={metric}
                stroke={C.info}
                strokeWidth={2}
                dot={{ r: 3, fill: C.info, strokeWidth: 0 }}
                name={metricMap[metric]}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title={`By Market — ${CUR_WK} vs ${PREV_WK}`} style={{ gridColumn: "1/-1" }}>
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 220}>
            <BarChart data={mktCompare} margin={{ top: 16, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                dataKey="market"
                tick={{ fill: C.muted, fontSize: isMobile ? 8 : 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT showDelta={true} />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar
                dataKey={metric}
                fill={C.info}
                radius={[3, 3, 0, 0]}
                name={`${metricMap[metric]} (${String(CUR_WK).slice(5)})`}
                label={<DeltaLabel data={mktCompare} dataKey={metric} pwKey={`${metric}_pw`} />}
              />
              <Bar
                dataKey={`${metric}_pw`}
                fill={C.subtle}
                radius={[3, 3, 0, 0]}
                name={`${metricMap[metric]} (${String(PREV_WK).slice(5)})`}
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

// ── 3. CAPACITY ───────────────────────────────────────────────────────────────
function CapacityReview({ bp, CUR_WK, PREV_WK, curByDow, utilByMktCompare, weekTrendData }) {
  const isMobile = bp === "mobile";
  const cols = isMobile ? 1 : 2;
  const chartH = isMobile ? 180 : 210;

  return (
    <div>
      <SectionHeader title="Capacity Review" sub={`${CUR_WK} vs ${PREV_WK}`} />

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 14 }}>
        <Card title="Slots & Techs by Day — Week in Review vs Prior Week">
          <ResponsiveContainer width="100%" height={chartH}>
            <ComposedChart data={curByDow} margin={{ top: 16, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="l" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="r"
                orientation="right"
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<TT showDelta={true} />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />

              <Bar
                yAxisId="l"
                dataKey="slots"
                fill={C.info}
                radius={[3, 3, 0, 0]}
                name={`Slots (${String(CUR_WK).slice(5)})`}
                label={<DeltaLabel data={curByDow} dataKey="slots" pwKey="slots_pw" />}
              />
              <Bar
                yAxisId="l"
                dataKey="slots_pw"
                fill={`${C.info}55`}
                radius={[3, 3, 0, 0]}
                name={`Slots (${String(PREV_WK).slice(5)})`}
              />

              <Line
                yAxisId="r"
                type="monotone"
                dataKey="techs"
                stroke={C.warning}
                strokeWidth={2}
                dot={{ r: 3, fill: C.warning, strokeWidth: 0 }}
                name={`Techs (${String(CUR_WK).slice(5)})`}
              />
              <Line
                yAxisId="r"
                type="monotone"
                dataKey="techs_pw"
                stroke={C.warning}
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 3, fill: C.warning, strokeWidth: 0 }}
                name={`Techs (${String(PREV_WK).slice(5)})`}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Utilization by Market — Week in Review vs Prior Week">
          <ResponsiveContainer width="100%" height={chartH}>
            <BarChart data={utilByMktCompare} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                unit="%"
              />
              <YAxis
                dataKey="market"
                type="category"
                tick={{ fill: C.muted, fontSize: isMobile ? 8 : 10 }}
                axisLine={false}
                tickLine={false}
                width={isMobile ? 62 : 72}
              />
              <Tooltip content={<TT showDelta={true} />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />

              <Bar
                dataKey="util"
                radius={[0, 3, 3, 0]}
                name={`Util% (${String(CUR_WK).slice(5)})`}
                label={<DeltaLabel data={utilByMktCompare} dataKey="util" pwKey="util_pw" />}
              >
                {utilByMktCompare.map((r, i) => (
                  <Cell key={i} fill={r.util >= 85 ? C.success : r.util >= 60 ? C.warning : C.danger} />
                ))}
              </Bar>

              <Bar dataKey="util_pw" radius={[0, 3, 3, 0]} name={`Util% (${String(PREV_WK).slice(5)})`}>
                {utilByMktCompare.map((r, i) => (
                  <Cell key={i} fill={`${r.util_pw >= 85 ? C.success : r.util_pw >= 60 ? C.warning : C.danger}55`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Utilization % Trend" style={{ gridColumn: "1/-1" }}>
          <ResponsiveContainer width="100%" height={isMobile ? 160 : 200}>
            <LineChart data={weekTrendData} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="week" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                unit="%"
              />
              <Tooltip content={<TT />} />
              <Line
                type="monotone"
                dataKey="util"
                stroke={C.success}
                strokeWidth={2}
                dot={{ r: 3, fill: C.success, strokeWidth: 0 }}
                name="Utilization %"
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Weekday vs Weekend Slot Capacity Trend" style={{ gridColumn: "1/-1" }}>
          <ResponsiveContainer width="100%" height={isMobile ? 160 : 200}>
            <LineChart data={weekTrendData} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="week" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey="wdSlots"
                stroke={C.info}
                strokeWidth={2}
                dot={{ r: 3, fill: C.info, strokeWidth: 0 }}
                name="Mon–Fri"
              />
              <Line
                type="monotone"
                dataKey="weSlots"
                stroke={C.danger}
                strokeWidth={2}
                dot={{ r: 3, fill: C.danger, strokeWidth: 0 }}
                name="Sat–Sun"
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

// ── 4. WORK MIX ───────────────────────────────────────────────────────────────
function WorkMix({ bp, weekMixData, curByMkt }) {
  const isMobile = bp === "mobile";
  const cols = isMobile ? 1 : 2;

  return (
    <div>
      <SectionHeader title="Work Mix Review" sub="Revenue vs non-revenue activity mix" />

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 14 }}>
        <Card title="Activity Mix by Week">
          <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
            <BarChart data={weekMixData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="week" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="completed" stackId="a" fill={C.success} name="Completed" />
              <Bar dataKey="warranty" stackId="a" fill={C.warning} name="Warranty" />
              <Bar dataKey="diagnostic" stackId="a" fill={C.info} name="Diagnostic" />
              <Bar dataKey="serviceCall" stackId="a" fill={C.danger} name="Service Call" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Jobs per Tech by Market">
          <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
            <BarChart data={curByMkt.filter((m) => m.techs > 0)} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
              <XAxis type="number" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis
                dataKey="market"
                type="category"
                tick={{ fill: C.muted, fontSize: isMobile ? 8 : 10 }}
                axisLine={false}
                tickLine={false}
                width={isMobile ? 62 : 72}
              />
              <Tooltip content={<TT />} />
              <Bar dataKey="jobsPerTech" radius={[0, 3, 3, 0]} name="Jobs/Tech">
                {curByMkt
                  .filter((m) => m.techs > 0)
                  .map((r, i) => (
                    <Cell key={i} fill={r.jobsPerTech >= 3 ? C.success : r.jobsPerTech >= 1.5 ? C.warning : C.danger} />
                  ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Revenue vs Non-Revenue by Market" style={{ gridColumn: "1/-1" }}>
          <ResponsiveContainer width="100%" height={isMobile ? 180 : 200}>
            <BarChart data={curByMkt} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                dataKey="market"
                tick={{ fill: C.muted, fontSize: isMobile ? 8 : 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="completed_jobs" stackId="a" fill={C.success} name="Completed" />
              <Bar dataKey="warranty_checks" stackId="a" fill={C.warning} name="Warranty" />
              <Bar dataKey="diagnostics" stackId="a" fill={C.info} name="Diagnostic" />
              <Bar dataKey="service_calls" stackId="a" fill={C.danger} name="Service Call" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

// ── 5. ACTION TABLE ───────────────────────────────────────────────────────────
function ActionTable({ bp, actionTableData, CUR_WK }) {
  const [sort, setSort] = useState("market");
  const [asc, setAsc] = useState(true);
  const isMobile = bp === "mobile";

  const sorted = useMemo(() => {
    return [...actionTableData].sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];

      if (typeof av === "string") {
        return asc ? av.localeCompare(bv) : bv.localeCompare(av);
      }

      return asc ? av - bv : bv - av;
    });
  }, [actionTableData, sort, asc]);

  const th = (key, lbl) => (
    <th
      onClick={() => {
        if (sort === key) setAsc(!asc);
        else {
          setSort(key);
          setAsc(true);
        }
      }}
      style={{
        padding: "10px 12px",
        textAlign: "left",
        color: C.muted,
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".06em",
        cursor: "pointer",
        whiteSpace: "nowrap",
        background: sort === key ? "#eff6ff" : C.panel,
        borderBottom: `2px solid ${sort === key ? C.info : C.border}`,
        userSelect: "none",
      }}
    >
      {lbl}
      {sort === key ? (asc ? " ↑" : " ↓") : ""}
    </th>
  );

  const cell = (v, lo, hi, fmt = "%") => {
    const col = v < lo ? C.danger : v < hi ? C.warning : C.success;
    const fv = fmt === "%" ? `${v.toFixed(1)}%` : fmt === "x" ? `${v.toFixed(1)}x` : Math.round(v);
    return (
      <td style={{ padding: "11px 12px", color: col, fontWeight: 600, fontSize: 12 }}>
        {fv}
      </td>
    );
  };

  if (isMobile) {
    return (
      <div>
        <SectionHeader title="Action Table" sub={CUR_WK} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((r) => (
            <div
              key={r.market}
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: 14,
                boxShadow: "0 1px 3px rgba(0,0,0,.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: C.primary, fontWeight: 800, fontSize: 14 }}>{r.market}</span>
                <span
                  style={{
                    background: `${STATUS_COLOR[r.status]}18`,
                    color: STATUS_COLOR[r.status],
                    border: `1px solid ${STATUS_COLOR[r.status]}44`,
                    borderRadius: 5,
                    padding: "3px 8px",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {r.status}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 8 }}>
                {[
                  ["Leads", r.leads, "n", null],
                  ["Bk Rate", r.bookingRate, "%", [35, 55]],
                  ["Conv%", r.convRate, "%", [25, 50]],
                  ["Util%", r.utilization, "%", [50, 75]],
                  ["Jobs", r.completed_jobs, "n", null],
                  ["LSR", r.lsr, "x", null],
                ].map(([lbl, val, fmt, thresholds]) => {
                  const col = thresholds
                    ? val < thresholds[0]
                      ? C.danger
                      : val < thresholds[1]
                      ? C.warning
                      : C.success
                    : C.secondary;

                  const fv = fmt === "%" ? `${val.toFixed(1)}%` : fmt === "x" ? `${val.toFixed(1)}x` : Math.round(val);

                  return (
                    <div key={lbl} style={{ background: C.panel, borderRadius: 6, padding: "6px 8px" }}>
                      <div style={{ color: C.muted, fontSize: 9, fontWeight: 600, textTransform: "uppercase" }}>{lbl}</div>
                      <div style={{ color: col, fontWeight: 700, fontSize: 13 }}>{fv}</div>
                    </div>
                  );
                })}
              </div>

              <div style={{ color: C.muted, fontSize: 11, padding: "6px 8px", background: C.panel, borderRadius: 6 }}>
                → {r.action}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader
        title="Opportunity & Action Table"
        sub={`${CUR_WK} · Status based on ${BASELINE_WEEKS}-week historical baseline · Click headers to sort`}
      />

      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,.05)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {th("market", "Market")}
                {th("leads", "Leads")}
                {th("bookingRate", "Bk Rate")}
                {th("convRate", "Conv%")}
                {th("techs", "Techs")}
                {th("slots", "Slots")}
                {th("utilization", "Util%")}
                {th("completed_jobs", "Jobs")}
                {th("nonRevPct", "Non-Rev%")}
                {th("lsr", "LSR")}
                <th
                  style={{
                    padding: "10px 12px",
                    color: C.muted,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    background: C.panel,
                    borderBottom: `2px solid ${C.border}`,
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: "10px 12px",
                    color: C.muted,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    background: C.panel,
                    borderBottom: `2px solid ${C.border}`,
                    minWidth: 200,
                  }}
                >
                  Action / Baseline
                </th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((r, i) => (
                <tr
                  key={r.market}
                  style={{
                    background: i % 2 === 0 ? C.surface : C.panel,
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <td style={{ padding: "11px 12px", color: C.primary, fontWeight: 700 }}>{r.market}</td>
                  <td style={{ padding: "11px 12px", color: C.secondary }}>{r.leads}</td>
                  {cell(r.bookingRate, 35, 55)}
                  {cell(r.convRate, 25, 50)}
                  <td style={{ padding: "11px 12px", color: C.secondary }}>{r.techs}</td>
                  <td style={{ padding: "11px 12px", color: C.secondary }}>{r.slots}</td>
                  {cell(r.utilization, 50, 75)}
                  <td style={{ padding: "11px 12px", color: C.secondary }}>{r.completed_jobs}</td>
                  {cell(r.nonRevPct, 0, 30)}
                  <td style={{ padding: "11px 12px", color: C.secondary }}>{r.lsr.toFixed(1)}x</td>
                  <td style={{ padding: "11px 12px" }}>
                    <span
                      style={{
                        background: `${STATUS_COLOR[r.status]}18`,
                        color: STATUS_COLOR[r.status],
                        border: `1px solid ${STATUS_COLOR[r.status]}44`,
                        borderRadius: 5,
                        padding: "3px 9px",
                        fontSize: 11,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: "11px 12px" }}>
                    <div style={{ color: C.muted, fontSize: 11 }}>{r.action}</div>

                    {r.baseline?.weeksUsed > 0 && (
                      <div style={{ fontSize: 10, color: C.subtle, marginTop: 3 }}>
                        {r.baseline.avgLeads !== null && `Avg leads: ${Math.round(r.baseline.avgLeads)}`}
                        {r.baseline.avgBookRate !== null && ` · Bk: ${(r.baseline.avgBookRate * 100).toFixed(0)}%`}
                        {r.baseline.avgCompRate !== null && ` · Cmp: ${(r.baseline.avgCompRate * 100).toFixed(0)}%`}
                        {r.baseline.avgUtilRate !== null && ` · Util: ${(r.baseline.avgUtilRate * 100).toFixed(0)}%`}
                      </div>
                    )}

                    {r.baseline?.weeksUsed === 0 && (
                      <div style={{ fontSize: 10, color: C.warning, marginTop: 3 }}>
                        No baseline — using fallback
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap" }}>
        {Object.entries(STATUS_COLOR).map(([s, c]) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
            <span style={{ color: C.muted, fontSize: 11 }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
