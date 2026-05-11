import { useState, useMemo, useEffect } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  ComposedChart,
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
  Balanced: C.success,
  "Demand Constrained": C.warning,
  "Supply Constrained": C.danger,
  "Funnel Issue": C.purple,
  "Conversion Issue": C.info,
};

const BASELINE_WEEKS = 12;
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const DATA_URL =
  "https://nubrakes-analytics.github.io/NuBrakes-Copilot/data/fact_nubrakes_supply_demand_daily.json";

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
const num = (v) =>
  v === "" || v == null || Number.isNaN(Number(v)) ? 0 : Number(v);

const str = (v) => (v == null ? "" : String(v));

const getChicagoTodayStr = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const getChicagoNowLabel = () =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());

const getWeekStartMonday = (dateStr) => {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + diff);

  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

const getLatestDataDate = (rows) => {
  const candidates = rows
    .map((r) =>
      str(r.date || r.day || r.created_at || r.createdAt || r.ds).slice(0, 10)
    )
    .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))
    .sort();

  return candidates.length ? candidates[candidates.length - 1] : "";
};

const countDistinctDays = (rows) => {
  return new Set(
    rows
      .map((r) => str(r.date || r.day || r.ds).slice(0, 10))
      .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))
  ).size;
};

const aggWeek = (rows) => {
  const r = {

  leads: 0,

  booked_jobs: 0,

  completed_jobs: 0,

  completed_job_0_rev: 0,

  completed_jobs_all_FT: 0,

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
    r.completed_job_0_rev += num(d.completed_job_0_rev);
    r.warranty_checks += num(d.warranty_checks);
    r.diagnostics += num(d.diagnostics);
    r.service_calls += num(d.service_calls);
    r.utilized_slots += num(d.utilized_slots);
    r.slots += num(d.slots);
    r.rev_job_slots_available += num(d.rev_job_slots_available);
    r.completed_jobs_all_FT += num(d.completed_jobs_all_FT);
  });

  const mktMax = {};
  rows.forEach((d) => {
    const market = str(d.market);
    const v = num(d.techs);
    mktMax[market] = Math.max(mktMax[market] || 0, v);
  });

  r.techs = Object.values(mktMax).reduce((a, b) => a + b, 0);
  return r;
};

const groupByWeek = (rows) => {
  const map = {};
  rows.forEach((d) => {
    const wk = str(d.week).slice(0, 10);
    if (!wk) return;
    if (!map[wk]) map[wk] = [];
    map[wk].push(d);
  });
  return map;
};

const pct = (a, b) => (b === 0 ? 0 : +((a / b) * 100).toFixed(1));

const derive = (agg) => ({
  ...agg,
  bookingRate: pct(agg.booked_jobs, agg.leads),
  convRate: pct(agg.completed_jobs, agg.leads),
  utilization: agg.slots > 0 ? pct(agg.utilized_slots, agg.slots) : 0,
  slotAvailPct:
    agg.slots > 0 ? pct(agg.rev_job_slots_available, agg.slots) : 0,
  lsr: agg.slots > 0 ? +(agg.leads / agg.slots).toFixed(1) : 0,
  jobsPerTech:
  agg.techs > 0
    ? +(agg.completed_jobs_all_FT / agg.techs).toFixed(1)
    : 0,
  nonRevPct:
    agg.utilized_slots > 0
      ? pct(agg.completed_job_0_rev, agg.utilized_slots)
      : 0,
  completionYield:
    agg.booked_jobs > 0 ? pct(agg.completed_jobs, agg.booked_jobs) : 0,
  revCapMix:
    agg.utilized_slots > 0 ? pct(agg.completed_jobs, agg.utilized_slots) : 0,
});

const buildScorecardBaseline = (allWeeks, baselineWeeks) => {
  if (!baselineWeeks.length) return derive(aggWeek([]));

  const weekly = baselineWeeks.map((wk) => derive(aggWeek(allWeeks[wk] || [])));

  const avg = (key) =>
    weekly.length
      ? weekly.reduce((sum, w) => sum + num(w[key]), 0) / weekly.length
      : 0;

  return {
    leads: avg("leads"),
    booked_jobs: avg("booked_jobs"),
    completed_jobs: avg("completed_jobs"),
    completed_job_0_rev: avg("completed_job_0_rev"),
    warranty_checks: avg("warranty_checks"),
    diagnostics: avg("diagnostics"),
    service_calls: avg("service_calls"),
    utilized_slots: avg("utilized_slots"),
    techs: avg("techs"),
    slots: avg("slots"),
    rev_job_slots_available: avg("rev_job_slots_available"),
    completed_jobs_all_FT: avg("completed_jobs_all_FT"),
    bookingRate: avg("bookingRate"),
    convRate: avg("convRate"),
    utilization: avg("utilization"),
    slotAvailPct: avg("slotAvailPct"),
    lsr: avg("lsr"),
    jobsPerTech: avg("jobsPerTech"),
    nonRevPct: avg("nonRevPct"),
    completionYield: avg("completionYield"),
    revCapMix: avg("revCapMix"),
  };
};

const buildDemandBaseline = (allWeeks, baselineWeeks, markets) => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const byDow = days.map((dow) => {
    const weekly = baselineWeeks.map((wk) => {
      const rows = (allWeeks[wk] || []).filter((r) => str(r.dow) === dow);
      return derive(aggWeek(rows));
    });

    const avg = (key) =>
      weekly.length
        ? weekly.reduce((sum, w) => sum + num(w[key]), 0) / weekly.length
        : 0;

    return {
      day: dow,
      leads_base: avg("leads"),
      bookRate_base: avg("bookingRate"),
      conv_base: avg("convRate"),
      lsr_base: avg("lsr"),
      slots_base: avg("slots"),
      techs_base: avg("techs"),
      util_base: avg("utilization"),
      avail_base: avg("slotAvailPct"),
    };
  });

  const byMarket = markets.map((market) => {
    const weekly = baselineWeeks.map((wk) => {
      const rows = (allWeeks[wk] || []).filter((r) => str(r.market) === market);
      return derive(aggWeek(rows));
    });

    const avg = (key) =>
      weekly.length
        ? weekly.reduce((sum, w) => sum + num(w[key]), 0) / weekly.length
        : 0;

    return {
      market,
      leads_base: avg("leads"),
      bookRate_base: avg("bookingRate"),
      conv_base: avg("convRate"),
      lsr_base: avg("lsr"),
    };
  });

  return { byDow, byMarket };
};

const buildWorkMixBaseline = (allWeeks, baselineWeeks, markets) => {
  const byMarket = markets.map((market) => {
    const weekly = baselineWeeks.map((wk) => {
      const rows = (allWeeks[wk] || []).filter((r) => str(r.market) === market);
      return derive(aggWeek(rows));
    });

    const avg = (key) =>
      weekly.length
        ? weekly.reduce((sum, w) => sum + num(w[key]), 0) / weekly.length
        : 0;

    return {
      market,
      completed_base: avg("completed_jobs"),
      completed0Rev_base: avg("completed_job_0_rev"),
      warranty_base: avg("warranty_checks"),
      diagnostic_base: avg("diagnostics"),
      serviceCall_base: avg("service_calls"),
      nonRevPct_base: avg("nonRevPct"),
      revCapMix_base: avg("revCapMix"),
    };
  });

  const overallWeekly = baselineWeeks.map((wk) =>
    derive(aggWeek(allWeeks[wk] || []))
  );

  const avgOverall = (key) =>
    overallWeekly.length
      ? overallWeekly.reduce((sum, w) => sum + num(w[key]), 0) / overallWeekly.length
      : 0;

  return {
    byMarket,
    overall: {
      completed_base: avgOverall("completed_jobs"),
      completed0Rev_base: avgOverall("completed_job_0_rev"),
      warranty_base: avgOverall("warranty_checks"),
      diagnostic_base: avgOverall("diagnostics"),
      serviceCall_base: avgOverall("service_calls"),
      nonRevPct_base: avgOverall("nonRevPct"),
      revCapMix_base: avgOverall("revCapMix"),
    },
  };
};

const buildBaselines = (allWeeks, pastWeeks, markets) => {
  const baselineWeekKeys = pastWeeks.slice(-(BASELINE_WEEKS + 1), -1);

  return markets.reduce((acc, market) => {
    const weeklyStats = baselineWeekKeys
      .map((wk) => {
        const rows = (allWeeks[wk] || []).filter((r) => str(r.market) === market);
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
      const vals = arr
        .map((w) => w[key])
        .filter((v) => v !== null && v !== undefined);
      return vals.length
        ? vals.reduce((s, v) => s + v, 0) / vals.length
        : null;
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
    if (curUtilRate > 0.9) return "Supply Constrained";
    if (curBookRate < 0.3) return "Funnel Issue";
    if (m.booked_jobs >= 10 && curCompRate < 0.8) return "Conversion Issue";
    return "Balanced";
  }

  const vLeads = variance(m.leads, b.avgLeads);
  const vBookRate = variance(curBookRate, b.avgBookRate);
  const vCompRate = variance(curCompRate, b.avgCompRate);
  const vUtilRate = variance(curUtilRate, b.avgUtilRate);

  if (vUtilRate !== null && vUtilRate > 0.1 && curUtilRate > 0.75)
    return "Supply Constrained";
  if (vLeads !== null && vLeads < -0.2) return "Demand Constrained";
  if (vBookRate !== null && vBookRate < -0.15) return "Funnel Issue";
  if (m.booked_jobs >= 10 && vCompRate !== null && vCompRate < -0.25)
    return "Conversion Issue";

  return "Balanced";
};

const diagAction = (s) =>
  ({
    "Demand Constrained": "Increase lead volume",
    "Funnel Issue": "Improve booking follow-up",
    "Supply Constrained":
      "Add slots / adjust staffing / Decrease Marketing Spend (Demand)",
    "Conversion Issue": "Investigate low completion yield",
    Balanced: "Monitor — no immediate action",
  })[s];

// ── Small UI Helpers ──────────────────────────────────────────────────────────
const Spark = ({ data, color = C.info }) => (
  <ResponsiveContainer width={56} height={24}>
    <LineChart data={data}>
      <Line
        type="monotone"
        dataKey="v"
        dot={false}
        strokeWidth={1.5}
        stroke={color}
      />
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
    <h2
      style={{ color: C.primary, fontSize: 16, fontWeight: 800, margin: 0 }}
    >
      {title}
    </h2>
    {sub && (
      <p style={{ color: C.muted, fontSize: 11, margin: "3px 0 0" }}>{sub}</p>
    )}
  </div>
);

const TT = ({ active, payload, label, showDelta = false }) => {
  if (!active || !payload?.length) return null;

  const cur = payload.find(
    (p) =>
      !String(p.dataKey).endsWith("_pw") && !String(p.dataKey).endsWith("_base")
  );
  const prev = payload.find(
    (p) =>
      String(p.dataKey).endsWith("_pw") || String(p.dataKey).endsWith("_base")
  );

  const delta =
    cur && prev && prev.value !== 0
      ? +(((cur.value - prev.value) / prev.value) * 100).toFixed(1)
      : null;
  const absDelta =
    cur && prev ? +(cur.value - prev.value).toFixed(1) : null;

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
      <p style={{ color: C.muted, margin: "0 0 4px", fontWeight: 600 }}>
        {label}
      </p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: "2px 0" }}>
          {p.name}:{" "}
          <b style={{ color: C.primary }}>
            {typeof p.value === "number" ? p.value.toFixed(1) : p.value}
          </b>
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
          Δ: {absDelta >= 0 ? "+" : ""}
          {absDelta} ({delta >= 0 ? "+" : ""}
          {delta}%)
        </p>
      )}
    </div>
  );
};

const DeltaLabel = ({ x, y, width, value, index, data, pwKey }) => {
  if (!data) return null;

  const row =
    typeof index === "number" && data[index] ? data[index] : null;

  if (!row || value == null) return null;

  const prev = row[pwKey];
  if (prev == null || prev === 0) return null;

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

function KPICard({
  label,
  cur,
  prev,
  fmt = "n",
  inv = false,
  isMobile = false,
  weekTrendData = [],
  compareLabel = "baseline",
}) {
  const d =
    fmt === "%" || fmt === "x"
      ? +(cur - prev).toFixed(1)
      : Math.round(cur - prev);
  const p = prev === 0 ? 0 : +(((cur - prev) / prev) * 100).toFixed(1);
  const up = d >= 0;
  const good = inv ? !up : up;
  const col = good ? C.success : C.danger;
  const bg = good ? "#d1fae5" : "#fee2e2";

  const sparkField = {
    Leads: "leads",
    "Booking Rate": "bookRate",
    "Conversion Rate": "conv",
    Utilization: "util",
    LSR: "lsr",
    Slots: "slots",
    "Completed Jobs": "completed",
  }[label];

  const sparkData = sparkField
    ? weekTrendData.map((w) => ({ v: w[sparkField] || 0 }))
    : [];

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

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            color: C.primary,
            fontSize: isMobile ? 20 : 26,
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          {KPI_VALUE_FORMAT(cur, fmt)}
        </span>
        {!isMobile && sparkField && <Spark data={sparkData} />}
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
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
          {KPI_VALUE_FORMAT(d, fmt)} vs {compareLabel}
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
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [lastLoadedAt, setLastLoadedAt] = useState("");
  const [loadError, setLoadError] = useState("");
  const bp = useBreakpoint();

  useEffect(() => {
    let isMounted = true;

    const loadData = async (isFirstLoad = false) => {
      if (isFirstLoad) setLoading(true);

      try {
        const res = await fetch(`${DATA_URL}?ts=${Date.now()}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`Failed to load dataset: ${res.status}`);
        }

        const d = await res.json();

        if (!isMounted) return;

        setRawData(Array.isArray(d) ? d : []);
        setLastLoadedAt(getChicagoNowLabel());
        setLoadError("");
      } catch (err) {
        console.error("fact_nubrakes_supply_demand_daily.json load failed", err);

        if (!isMounted) return;

        setLoadError(err?.message || "Dataset load failed");

        if (isFirstLoad) {
          setRawData([]);
        }
      } finally {
        if (isMounted && isFirstLoad) {
          setLoading(false);
        }
      }
    };

    loadData(true);
    const timer = setInterval(() => {
      loadData(false);
    }, AUTO_REFRESH_MS);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  const derived = useMemo(() => {
    const RAW = rawData;

    if (!RAW.length) {
      return {
        CUR: derive(aggWeek([])),
        PREV: derive(aggWeek([])),
        BASE: derive(aggWeek([])),
        CUR_WK: "",
        PREV_WK: "",
        allWeekKeys: [],
        lastCompletedWeek: "",
        latestAvailableWeek: "",
        latestDataDate: "",
        curByMkt: [],
        prevByMkt: [],
        mktCompare: [],
        curByDow: [],
        weekTrendData: [],
        weekMixData: [],
        workMixCompare: [],
        workMixSignal: {
          completed: 0,
          completed_base: 0,
          completed0Rev: 0,
          completed0Rev_base: 0,
        },
        utilByMktCompare: [],
        actionTableData: [],
        capacityTableData: [],
        weeklyMarketHeatmap: [],
        weeklyDowHeatmap: [],
        markets: [],
        scorecardBaselineMeta: {
          weeksUsed: 0,
          startWeek: "",
          endWeek: "",
        },
      };
    }

    const allWeeks = groupByWeek(RAW);
    const weekKeys = Object.keys(allWeeks).sort();

    const todayStr = getChicagoTodayStr();
    const thisWeekStart = getWeekStartMonday(todayStr);

    const pastWeeks = weekKeys.filter((k) => k < thisWeekStart);
    const latestAvailableWeek = weekKeys[weekKeys.length - 1] || "";

    const lastCompletedWeek =
      pastWeeks[pastWeeks.length - 1] || latestAvailableWeek;

    const safeSelectedWeek =
      selectedWeek && weekKeys.includes(selectedWeek) ? selectedWeek : null;

    const CUR_WK = safeSelectedWeek || lastCompletedWeek;
    const curIdx = weekKeys.indexOf(CUR_WK);
    const PREV_WK = curIdx > 0 ? weekKeys[curIdx - 1] : CUR_WK;

    const curRows = allWeeks[CUR_WK] || [];
    const prevRows = allWeeks[PREV_WK] || [];

    const CUR = derive(aggWeek(curRows));
    const PREV = derive(aggWeek(prevRows));

    const scorecardBaselineWeeks = weekKeys.filter((k) => k < CUR_WK).slice(-12);
    const BASE = buildScorecardBaseline(allWeeks, scorecardBaselineWeeks);

    const scorecardBaselineMeta = {
      weeksUsed: scorecardBaselineWeeks.length,
      startWeek: scorecardBaselineWeeks[0] || "",
      endWeek: scorecardBaselineWeeks[scorecardBaselineWeeks.length - 1] || "",
    };

    const MARKETS = [...new Set(RAW.map((r) => str(r.market)).filter(Boolean))].sort();

    const demandBaselineWeeks = weekKeys.filter((k) => k < CUR_WK).slice(-12);
    const demandBaseline = buildDemandBaseline(allWeeks, demandBaselineWeeks, MARKETS);
    const workMixBaseline = buildWorkMixBaseline(
      allWeeks,
      demandBaselineWeeks,
      MARKETS
    );

    const curByMkt = MARKETS.map((m) => {
  const marketRows = curRows.filter((r) => str(r.market) === m);
  const agg = aggWeek(marketRows);
  const daysCount = countDistinctDays(marketRows);

  return {
    market: m,
    ...derive(agg),
    jobsPerDayPerTech:
  daysCount > 0 && agg.techs > 0
    ? +(
        agg.completed_jobs_all_FT /
        daysCount /
        agg.techs
      ).toFixed(2)
    : 0,
  };
});

    const prevByMkt = MARKETS.map((m) => ({
      market: m,
      ...derive(aggWeek(prevRows.filter((r) => str(r.market) === m))),
    }));

    const mktCompare = MARKETS.map((m) => {
      const c = curByMkt.find((r) => r.market === m);
      const b = demandBaseline.byMarket.find((r) => r.market === m) || {};

      return {
        market: m,
        leads: c?.leads || 0,
        leads_base: b.leads_base || 0,
        bookRate: c?.bookingRate || 0,
        bookRate_base: b.bookRate_base || 0,
        conv: c?.convRate || 0,
        conv_base: b.conv_base || 0,
        lsr: c?.lsr || 0,
        lsr_base: b.lsr_base || 0,
      };
    });

    const curByDow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
      (dow) => {
        const cR = curRows.filter((r) => str(r.dow) === dow);
        const c = cR.length ? derive(aggWeek(cR)) : null;
        const b = demandBaseline.byDow.find((r) => r.day === dow) || {};

        return {
          day: dow,
          leads: c?.leads || 0,
          leads_base: b.leads_base || 0,
          bookRate: c?.bookingRate || 0,
          bookRate_base: b.bookRate_base || 0,
          conv: c?.convRate || 0,
          conv_base: b.conv_base || 0,
          lsr: c?.lsr || 0,
          lsr_base: b.lsr_base || 0,
          slots: c?.slots || 0,
          slots_base: b.slots_base || 0,
          techs: c?.techs || 0,
          techs_base: b.techs_base || 0,
          util: c?.utilization || 0,
          util_base: b.util_base || 0,
          avail: c?.slotAvailPct || 0,
          avail_base: b.avail_base || 0,
        };
      }
    );

    const weekTrendData = weekKeys
      .filter((k) => k <= CUR_WK)
      .map((k) => {
        const rows = allWeeks[k];
        const a = derive(aggWeek(rows));

        const wdSlots = rows
          .filter((r) => ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(str(r.dow)))
          .reduce((s, r) => s + num(r.slots), 0);

        const weSlots = rows
          .filter((r) => ["Sat", "Sun"].includes(str(r.dow)))
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
          completed0Rev: a.completed_job_0_rev,
          warranty: a.warranty_checks,
          diagnostic: a.diagnostics,
          serviceCall: a.service_calls,
        };
      });

    const workMixCompare = MARKETS.map((market) => {
  const cur = curByMkt.find((m) => m.market === market) || {};
  const base = workMixBaseline.byMarket.find((m) => m.market === market) || {};

  const baselineRowsByWeek = demandBaselineWeeks.map((wk) => {
    const rows = (allWeeks[wk] || []).filter((r) => str(r.market) === market);
    const agg = aggWeek(rows);
    const daysCount = countDistinctDays(rows);

    return daysCount > 0 && agg.techs > 0

  ? agg.completed_jobs_all_FT / daysCount / agg.techs

  : 0;
  });

  const jobsPerDayPerTech_12w = baselineRowsByWeek.length
    ? +(
        baselineRowsByWeek.reduce((sum, v) => sum + num(v), 0) /
        baselineRowsByWeek.length
      ).toFixed(2)
    : 0;

  return {
    market,
    completed: cur.completed_jobs || 0,
    completed_base: base.completed_base || 0,

    completed0Rev: cur.completed_job_0_rev || 0,
    completed0Rev_base: base.completed0Rev_base || 0,

    warranty: cur.warranty_checks || 0,
    warranty_base: base.warranty_base || 0,

    diagnostic: cur.diagnostics || 0,
    diagnostic_base: base.diagnostic_base || 0,

    serviceCall: cur.service_calls || 0,
    serviceCall_base: base.serviceCall_base || 0,

    nonRevPct: cur.nonRevPct || 0,
    nonRevPct_base: base.nonRevPct_base || 0,

    revCapMix: cur.revCapMix || 0,
    revCapMix_base: base.revCapMix_base || 0,

    jobsPerDayPerTech: cur.jobsPerDayPerTech || 0,
    jobsPerDayPerTech_12w,
  };
});

    const workMixSignal = {
      completed: CUR.completed_jobs || 0,
      completed_base: workMixBaseline.overall.completed_base || 0,
      completed0Rev: CUR.completed_job_0_rev || 0,
      completed0Rev_base: workMixBaseline.overall.completed0Rev_base || 0,
    };

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

    const capacityTableData = MARKETS.map((market) => {
      const cur = curByMkt.find((m) => m.market === market) || {};

      const weekly = demandBaselineWeeks.map((wk) => {
        const rows = (allWeeks[wk] || []).filter((r) => str(r.market) === market);
        return derive(aggWeek(rows));
      });

      const avg = (key) =>
        weekly.length
          ? weekly.reduce((sum, w) => sum + num(w[key]), 0) / weekly.length
          : 0;

      const util12w = avg("utilization");
      const slots12w = avg("slots");
      const techs12w = avg("techs");
      const avail12w = avg("slotAvailPct");
      const jobsPerTech12w = (() => {

  const vals = weekly

    .map((w) => num(w.jobsPerTech))

    .filter((v) => v > 0);

  return vals.length

    ? vals.reduce((sum, v) => sum + v, 0) / vals.length

    : 0;

})();
      const jobs12w = avg("completed_jobs");

      const variancePct =
        util12w > 0
          ? +((((cur.utilization || 0) - util12w) / util12w) * 100).toFixed(1)
          : 0;

      const direction =
        util12w > 0
          ? (cur.utilization || 0) >= util12w
            ? "Above"
            : "Below"
          : "Flat";

      return {
        market,

        slots: cur.slots || 0,
        slots_12w: slots12w,

        techs: cur.techs || 0,
        techs_12w: techs12w,

        util: cur.utilization || 0,
        util_12w: util12w,

        slotAvailPct: cur.slotAvailPct || 0,
        slotAvailPct_12w: avail12w,

        jobsPerTech: cur.jobsPerTech || 0,
        jobsPerTech_12w: jobsPerTech12w,

        completed_jobs: cur.completed_jobs || 0,
        completed_jobs_12w: jobs12w,

        variancePct,
        direction,
      };
    });

    const last16Weeks = weekKeys.filter((k) => k <= CUR_WK).slice(-16);

    const weeklyMarketHeatmap = last16Weeks.map((wk) => {
      const row = { week: wk.slice(5), fullWeek: wk };

      MARKETS.forEach((market) => {
        const rows = (allWeeks[wk] || []).filter((r) => str(r.market) === market);
        const a = derive(aggWeek(rows));
        row[market] = a.utilization;
      });

      return row;
    });

    const weeklyDowHeatmap = last16Weeks.map((wk) => {
      const baseRows = allWeeks[wk] || [];

      const allMarketsRow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].reduce(
        (acc, dow) => {
          const a = derive(aggWeek(baseRows.filter((r) => str(r.dow) === dow)));
          acc[dow] = a.utilization;
          return acc;
        },
        {}
      );

      const byMarket = MARKETS.reduce((acc, market) => {
        const marketRows = baseRows.filter((r) => str(r.market) === market);

        acc[market] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].reduce(
          (dAcc, dow) => {
            const a = derive(
              aggWeek(marketRows.filter((r) => str(r.dow) === dow))
            );
            dAcc[dow] = a.utilization;
            return dAcc;
          },
          {}
        );

        return acc;
      }, {});

      return {
        week: wk.slice(5),
        fullWeek: wk,
        allMarkets: allMarketsRow,
        byMarket,
      };
    });

    return {
      CUR,
      PREV,
      BASE,
      CUR_WK,
      PREV_WK,
      allWeekKeys: weekKeys,
      lastCompletedWeek,
      latestAvailableWeek,
      latestDataDate: getLatestDataDate(RAW),
      curByMkt,
      prevByMkt,
      mktCompare,
      curByDow,
      weekTrendData,
      weekMixData,
      workMixCompare,
      workMixSignal,
      utilByMktCompare,
      actionTableData,
      capacityTableData,
      weeklyMarketHeatmap,
      weeklyDowHeatmap,
      markets: MARKETS,
      scorecardBaselineMeta,
    };
  }, [rawData, selectedWeek]);

  useEffect(() => {
    if (!selectedWeek) return;
    if (!derived.allWeekKeys.includes(selectedWeek)) {
      setSelectedWeek(null);
    }
  }, [derived.allWeekKeys, selectedWeek]);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  const {
    allWeekKeys,
    lastCompletedWeek,
    CUR_WK,
    latestAvailableWeek,
    latestDataDate,
  } = derived;

  const curIdx = allWeekKeys.indexOf(CUR_WK);
  const isAtLastCompleted =
    selectedWeek === null || selectedWeek === lastCompletedWeek;
  const canGoPrev = curIdx > 0;
  const canGoNext = curIdx >= 0 && curIdx < allWeekKeys.length - 1;

  const navBtnStyle = (enabled) => ({
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 16,
    fontWeight: 700,
    cursor: enabled ? "pointer" : "not-allowed",
    color: enabled ? C.secondary : C.subtle,
    lineHeight: 1,
  });

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        fontFamily: "Inter,system-ui,sans-serif",
        color: C.primary,
      }}
    >
      <div
        style={{
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          padding: bp === "mobile" ? "12px 16px" : "16px 24px",
          boxShadow: "0 1px 3px rgba(0,0,0,.05)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: bp === "mobile" ? 15 : 18,
            fontWeight: 800,
          }}
        >
          Supply and Demand Dashboard
        </h1>
        <p style={{ margin: 0, fontSize: 11, color: C.muted }}>
          Week of {derived.CUR_WK || "-"} · vs {derived.PREV_WK || "-"}
        </p>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 4,
          }}
        >
          {latestDataDate && (
            <p style={{ margin: 0, fontSize: 11, color: C.subtle }}>
              Data through {latestDataDate}
            </p>
          )}
          {lastLoadedAt && (
            <p style={{ margin: 0, fontSize: 11, color: C.subtle }}>
              Refreshed {lastLoadedAt} CT
            </p>
          )}
          {latestAvailableWeek && (
            <p style={{ margin: 0, fontSize: 11, color: C.subtle }}>
              Latest available week: {latestAvailableWeek}
            </p>
          )}
          {loadError && (
            <p style={{ margin: 0, fontSize: 11, color: C.danger }}>
              {loadError}
            </p>
          )}
        </div>
      </div>

      <div
        style={{
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          padding: bp === "mobile" ? "10px 16px" : "10px 24px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: C.muted,
            fontWeight: 600,
            marginRight: 2,
          }}
        >
          Week
        </span>

        <button
          disabled={!canGoPrev}
          onClick={() => {
            if (canGoPrev) setSelectedWeek(allWeekKeys[curIdx - 1]);
          }}
          style={navBtnStyle(canGoPrev)}
          title="Previous week"
        >
          ‹
        </button>

        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: C.primary,
            minWidth: 94,
            textAlign: "center",
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: "5px 10px",
          }}
        >
          {CUR_WK || "—"}
        </span>

        <button
          disabled={!canGoNext}
          onClick={() => {
            if (canGoNext) setSelectedWeek(allWeekKeys[curIdx + 1]);
          }}
          style={navBtnStyle(canGoNext)}
          title="Next week"
        >
          ›
        </button>

        {!isAtLastCompleted && (
          <button
            onClick={() => setSelectedWeek(null)}
            style={{
              background: C.surface,
              color: C.info,
              border: `1px solid ${C.info}`,
              borderRadius: 20,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              marginLeft: 4,
            }}
            title={`Jump to last completed week (${lastCompletedWeek})`}
          >
            ← Last Completed
          </button>
        )}

        {isAtLastCompleted && (
          <span
            style={{
              fontSize: 11,
              color: C.subtle,
              marginLeft: 4,
              fontStyle: "italic",
            }}
          >
            Last completed week
          </span>
        )}

        {latestAvailableWeek && CUR_WK !== latestAvailableWeek && (
          <button
            onClick={() => setSelectedWeek(latestAvailableWeek)}
            style={{
              background: C.surface,
              color: C.teal,
              border: `1px solid ${C.teal}`,
              borderRadius: 20,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
            title={`Jump to latest available week (${latestAvailableWeek})`}
          >
            Latest Available →
          </button>
        )}
      </div>

      <div
        style={{
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          overflowX: "auto",
          whiteSpace: "nowrap",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            padding: `0 ${bp === "mobile" ? "12px" : "24px"}`,
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: "transparent",
                color: tab === t.id ? C.info : C.muted,
                border: "none",
                borderBottom: `2px solid ${
                  tab === t.id ? C.info : "transparent"
                }`,
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

      <div
        style={{
          padding: bp === "mobile" ? "14px" : "24px",
          maxWidth: 1400,
          margin: "0 auto",
        }}
      >
        {tab === "scorecard" && (
          <Scorecard
            bp={bp}
            CUR={derived.CUR}
            BASE={derived.BASE}
            weekTrendData={derived.weekTrendData}
            CUR_WK={derived.CUR_WK}
            scorecardBaselineMeta={derived.scorecardBaselineMeta}
          />
        )}

        {tab === "demand" && (
          <DemandReview
            bp={bp}
            CUR_WK={derived.CUR_WK}
            curByDow={derived.curByDow}
            weekTrendData={derived.weekTrendData}
            mktCompare={derived.mktCompare}
            scorecardBaselineMeta={derived.scorecardBaselineMeta}
          />
        )}

        {tab === "capacity" && (
          <CapacityReview
            bp={bp}
            CUR_WK={derived.CUR_WK}
            PREV_WK={derived.PREV_WK}
            curByDow={derived.curByDow}
            capacityTableData={derived.capacityTableData}
            weeklyMarketHeatmap={derived.weeklyMarketHeatmap}
            weeklyDowHeatmap={derived.weeklyDowHeatmap}
            markets={derived.markets}
            scorecardBaselineMeta={derived.scorecardBaselineMeta}
          />
        )}

        {tab === "workmix" && (
          <WorkMix
            bp={bp}
            rawData={rawData}
            weekMixData={derived.weekMixData}
            curByMkt={derived.curByMkt}
            workMixCompare={derived.workMixCompare}
            workMixSignal={derived.workMixSignal}
            CUR_WK={derived.CUR_WK}
            scorecardBaselineMeta={derived.scorecardBaselineMeta}
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
function Scorecard({ bp, CUR, BASE, weekTrendData, CUR_WK, scorecardBaselineMeta }) {
  const isMobile = bp === "mobile";
  const cols = isMobile ? 2 : bp === "tablet" ? 3 : 5;

  const kpis = [
    { label: "Leads", cur: CUR.leads, prev: BASE.leads, fmt: "n" },
    {
      label: "Booking Rate",
      cur: CUR.bookingRate,
      prev: BASE.bookingRate,
      fmt: "%",
    },
    {
      label: "Conversion Rate",
      cur: CUR.convRate,
      prev: BASE.convRate,
      fmt: "%",
    },
    {
      label: "Completed Jobs",
      cur: CUR.completed_jobs,
      prev: BASE.completed_jobs,
      fmt: "n",
    },
    {
      label: "Utilization",
      cur: CUR.utilization,
      prev: BASE.utilization,
      fmt: "%",
    },
    { label: "Techs", cur: CUR.techs, prev: BASE.techs, fmt: "n" },
    { label: "Slots", cur: CUR.slots, prev: BASE.slots, fmt: "n" },
    {
      label: "% Slots Avail",
      cur: CUR.slotAvailPct,
      prev: BASE.slotAvailPct,
      fmt: "%",
    },
    { label: "LSR", cur: CUR.lsr, prev: BASE.lsr, fmt: "x", inv: true },
  ];

  return (
    <div>
      <SectionHeader
        title="Weekly Scorecard"
        sub={
          scorecardBaselineMeta.weeksUsed > 0
            ? `${CUR_WK} vs last ${scorecardBaselineMeta.weeksUsed}-week average (${scorecardBaselineMeta.startWeek} to ${scorecardBaselineMeta.endWeek})`
            : `${CUR_WK} vs baseline unavailable`
        }
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols},1fr)`,
          gap: 10,
        }}
      >
        {kpis.map((k) => (
          <KPICard
            key={k.label}
            {...k}
            isMobile={isMobile}
            weekTrendData={weekTrendData}
            compareLabel={`${scorecardBaselineMeta.weeksUsed || 12}W avg`}
          />
        ))}
      </div>
    </div>
  );
}

// ── 2. DEMAND ─────────────────────────────────────────────────────────────────
function DemandReview({
  bp,
  CUR_WK,
  curByDow,
  weekTrendData,
  mktCompare,
  scorecardBaselineMeta,
}) {
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

  const metricBaseMap = {
    leads: "leads_base",
    bookRate: "bookRate_base",
    conv: "conv_base",
    lsr: "lsr_base",
  };

  return (
    <div>
      <SectionHeader
        title="Demand Review"
        sub={
          scorecardBaselineMeta.weeksUsed > 0
            ? `${CUR_WK} vs last ${scorecardBaselineMeta.weeksUsed}-week average (${scorecardBaselineMeta.startWeek} to ${scorecardBaselineMeta.endWeek})`
            : `${CUR_WK} vs baseline unavailable`
        }
      />

      <div
        style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}
      >
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols},1fr)`,
          gap: 14,
        }}
      >
        <Card title="Week in Review vs 12-Week Average by Day">
          <ResponsiveContainer width="100%" height={chartH}>
            <BarChart
              data={curByDow}
              margin={{ top: 16, right: 4, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                dataKey="day"
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<TT showDelta={true} />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar
                dataKey={metric}
                fill={C.info}
                radius={[3, 3, 0, 0]}
                name={`${metricMap[metric]} (${String(CUR_WK).slice(5)})`}
                label={<DeltaLabel data={curByDow} pwKey={metricBaseMap[metric]} />}
              />
              <Bar
                dataKey={metricBaseMap[metric]}
                fill={C.subtle}
                radius={[3, 3, 0, 0]}
                name={`${metricMap[metric]} (12W Avg)`}
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Weekly Trend">
          <ResponsiveContainer width="100%" height={chartH}>
            <LineChart
              data={weekTrendData}
              margin={{ top: 8, right: 4, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                dataKey="week"
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
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

        <Card
          title={`By Market — ${CUR_WK} vs 12-Week Average`}
          style={{ gridColumn: "1/-1" }}
        >
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 220}>
            <BarChart
              data={mktCompare}
              margin={{ top: 16, right: 4, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                dataKey="market"
                tick={{ fill: C.muted, fontSize: isMobile ? 8 : 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<TT showDelta={true} />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar
                dataKey={metric}
                fill={C.info}
                radius={[3, 3, 0, 0]}
                name={`${metricMap[metric]} (${String(CUR_WK).slice(5)})`}
                label={<DeltaLabel data={mktCompare} pwKey={`${metric}_base`} />}
              />
              <Bar
                dataKey={`${metric}_base`}
                fill={C.subtle}
                radius={[3, 3, 0, 0]}
                name={`${metricMap[metric]} (12W Avg)`}
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

// ── 3. CAPACITY ───────────────────────────────────────────────────────────────
function CapacityReview({
  bp,
  CUR_WK,
  PREV_WK,
  curByDow,
  capacityTableData,
  weeklyMarketHeatmap,
  weeklyDowHeatmap,
  markets,
  scorecardBaselineMeta,
}) {
  const [heatmapScope, setHeatmapScope] = useState("All Markets");
  const isMobile = bp === "mobile";
  const cols = isMobile ? 1 : 2;
  const chartH = isMobile ? 190 : 220;

  const heatColor = (v) => {
    if (v >= 85) return "#d1fae5";
    if (v >= 70) return "#fef3c7";
    if (v > 0) return "#fee2e2";
    return "#f8fafc";
  };

  const heatText = (v) => {
    if (v >= 85) return C.success;
    if (v >= 70) return C.warning;
    if (v > 0) return C.danger;
    return C.subtle;
  };

  return (
    <div>
      <SectionHeader
        title="Capacity Review"
        sub={
          scorecardBaselineMeta.weeksUsed > 0
            ? `${CUR_WK} vs last ${scorecardBaselineMeta.weeksUsed}-week average (${scorecardBaselineMeta.startWeek} to ${scorecardBaselineMeta.endWeek})`
            : `${CUR_WK} vs baseline unavailable`
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols},1fr)`,
          gap: 14,
        }}
      >
        <Card title="Capacity Table — Current Week vs 12-Week Average" style={{ gridColumn: "1/-1" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {[
                    "Market",
                    "Slots",
                    "12W Avg Slots",
                    "Techs",
                    "12W Avg Techs",
                    "Util%",
                    "12W Avg Util%",
                    "Δ vs 12W",
                    "Direction",
                    "Avail%",
                    "12W Avg Avail%",
                    "Jobs/Tech (FT only)",

"12W Avg Jobs/Tech (FT only)",
                    "Jobs",
                    "12W Avg Jobs",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        color: C.muted,
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: ".06em",
                        background: C.panel,
                        borderBottom: `1px solid ${C.border}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {capacityTableData.map((r, i) => (
                  <tr
                    key={r.market}
                    style={{
                      background: i % 2 === 0 ? C.surface : C.panel,
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    <td style={{ padding: "11px 12px", fontWeight: 700, color: C.primary }}>
                      {r.market}
                    </td>

                    <td style={{ padding: "11px 12px", color: C.secondary }}>
                      {Math.round(r.slots)}
                    </td>
                    <td style={{ padding: "11px 12px", color: C.secondary }}>
                      {Math.round(r.slots_12w)}
                    </td>

                    <td style={{ padding: "11px 12px", color: C.secondary }}>
                      {Math.round(r.techs)}
                    </td>
                    <td style={{ padding: "11px 12px", color: C.secondary }}>
                      {Math.round(r.techs_12w)}
                    </td>

                    <td style={{ padding: "11px 12px", color: C.secondary }}>
                      {r.util.toFixed(1)}%
                    </td>
                    <td style={{ padding: "11px 12px", color: C.secondary }}>
                      {r.util_12w.toFixed(1)}%
                    </td>

                    <td
                      style={{
                        padding: "11px 12px",
                        color: r.variancePct >= 0 ? C.success : C.danger,
                        fontWeight: 700,
                      }}
                    >
                      {r.variancePct >= 0 ? "+" : ""}
                      {r.variancePct.toFixed(1)}%
                    </td>

                    <td style={{ padding: "11px 12px" }}>
                      <span
                        style={{
                          background:
                            r.direction === "Above"
                              ? "#d1fae5"
                              : r.direction === "Below"
                              ? "#fee2e2"
                              : "#e5e7eb",
                          color:
                            r.direction === "Above"
                              ? C.success
                              : r.direction === "Below"
                              ? C.danger
                              : C.muted,
                          borderRadius: 5,
                          padding: "3px 8px",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {r.direction}
                      </span>
                    </td>

                    <td style={{ padding: "11px 12px", color: C.secondary }}>
                      {r.slotAvailPct.toFixed(1)}%
                    </td>
                    <td style={{ padding: "11px 12px", color: C.secondary }}>
                      {r.slotAvailPct_12w.toFixed(1)}%
                    </td>

                    <td style={{ padding: "11px 12px", color: C.secondary }}>
                      {r.jobsPerTech.toFixed(1)}
                    </td>
                    <td style={{ padding: "11px 12px", color: C.secondary }}>
                      {r.jobsPerTech_12w.toFixed(1)}
                    </td>

                    <td style={{ padding: "11px 12px", color: C.secondary }}>
                      {Math.round(r.completed_jobs)}
                    </td>
                    <td style={{ padding: "11px 12px", color: C.secondary }}>
                      {Math.round(r.completed_jobs_12w)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Slots & Techs by Day — Week in Review vs 12-Week Average">
          <ResponsiveContainer width="100%" height={chartH}>
            <ComposedChart
              data={curByDow}
              margin={{ top: 16, right: 4, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                dataKey="day"
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="l"
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
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
                label={<DeltaLabel data={curByDow} pwKey="slots_base" />}
              />
              <Bar
                yAxisId="l"
                dataKey="slots_base"
                fill={`${C.info}55`}
                radius={[3, 3, 0, 0]}
                name="Slots (12W Avg)"
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
                dataKey="techs_base"
                stroke={C.warning}
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 3, fill: C.warning, strokeWidth: 0 }}
                name="Techs (12W Avg)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Utilization by Market — Current vs 12W Avg">
          <ResponsiveContainer width="100%" height={isMobile ? 260 : 320}>
            <ComposedChart
              data={capacityTableData}
              layout="vertical"
              margin={{ top: 12, right: 24, left: 8, bottom: 0 }}
            >
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
                width={isMobile ? 70 : 90}
              />
              <Tooltip content={<TT showDelta={true} />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />

              <Bar
                dataKey="util"
                radius={[0, 3, 3, 0]}
                fill={C.info}
                name={`Util% (${String(CUR_WK).slice(5)})`}
              />
              <Bar
                dataKey="util_12w"
                radius={[0, 3, 3, 0]}
                fill={`${C.subtle}99`}
                name="Util% (12W Avg)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card
  title="Utilization Heatmap by Market — Last 16 Weeks"
  style={{ gridColumn: "1/-1" }}
>
  {(() => {
    const totalRow = markets.reduce((acc, market) => {
      const vals = weeklyMarketHeatmap
        .map((r) => Number(r[market] || 0))
        .filter((v) => v > 0);

      acc[market] = vals.length
        ? vals.reduce((sum, v) => sum + v, 0) / vals.length
        : 0;

      return acc;
    }, {});
    
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 6 }}>
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  fontSize: 11,
                  color: C.muted,
                  paddingBottom: 4,
                  whiteSpace: "nowrap",
                }}
              >
                Week
              </th>
              {markets.map((market) => (
                <th
                  key={market}
                  style={{
                    textAlign: "center",
                    fontSize: 11,
                    color: C.muted,
                    paddingBottom: 4,
                    minWidth: 74,
                    whiteSpace: "nowrap",
                  }}
                >
                  {market}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {weeklyMarketHeatmap.map((r) => (
              <tr key={r.fullWeek}>
                <td
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.primary,
                    whiteSpace: "nowrap",
                    paddingRight: 8,
                  }}
                >
                  {r.week}
                </td>

                {markets.map((market) => {
                  const v = Number(r[market] || 0);

                  return (
                    <td key={market}>
                      <div
                        style={{
                          background: heatColor(v),
                          color: heatText(v),
                          border: `1px solid ${C.border}`,
                          borderRadius: 8,
                          padding: "10px 6px",
                          textAlign: "center",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                        title={`${r.week} · ${market}: ${v.toFixed(1)}%`}
                      >
                        {v ? `${v.toFixed(1)}%` : "—"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}

            <tr>
              <td
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: C.primary,
                  whiteSpace: "nowrap",
                  paddingRight: 8,
                }}
              >
                Total
              </td>

              {markets.map((market) => {
                const v = Number(totalRow[market] || 0);

                return (
                  <td key={market}>
                    <div
                      style={{
                        background: heatColor(v),
                        color: heatText(v),
                        border: `1px solid ${C.primary}`,
                        borderRadius: 8,
                        padding: "10px 6px",
                        textAlign: "center",
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                      title={`Average across displayed weeks · ${market}: ${v.toFixed(1)}%`}
                    >
                      {v ? `${v.toFixed(1)}%` : "—"}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    );
  })()}
</Card>

        <Card title="Utilization Heatmap — Day of Week" style={{ gridColumn: "1/-1" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {["All Markets", ...markets].map((market) => (
              <button
                key={market}
                onClick={() => setHeatmapScope(market)}
                style={{
                  background: heatmapScope === market ? C.info : C.surface,
                  color: heatmapScope === market ? "#fff" : C.muted,
                  border: `1px solid ${heatmapScope === market ? C.info : C.border}`,
                  borderRadius: 20,
                  padding: "5px 14px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {market}
              </button>
            ))}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 6 }}>
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      color: C.muted,
                      paddingBottom: 4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Week
                  </th>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <th
                      key={d}
                      style={{
                        textAlign: "center",
                        fontSize: 11,
                        color: C.muted,
                        paddingBottom: 4,
                        minWidth: 64,
                      }}
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
  {(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const totalRow = days.reduce((acc, day) => {
      const vals = weeklyDowHeatmap
        .map((r) => {
          const row =
            heatmapScope === "All Markets"
              ? r.allMarkets
              : r.byMarket[heatmapScope] || {};
          return Number(row[day] || 0);
        })
        .filter((v) => v > 0);

      acc[day] = vals.length
        ? vals.reduce((sum, v) => sum + v, 0) / vals.length
        : 0;

      return acc;
    }, {});

    return (
      <>
        {weeklyDowHeatmap.map((r) => {
          const row =
            heatmapScope === "All Markets"
              ? r.allMarkets
              : r.byMarket[heatmapScope] || {};

          return (
            <tr key={r.fullWeek}>
              <td
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.primary,
                  whiteSpace: "nowrap",
                  paddingRight: 8,
                }}
              >
                {r.week}
              </td>
              {days.map((d) => {
                const v = Number(row[d] || 0);
                return (
                  <td key={d}>
                    <div
                      style={{
                        background: heatColor(v),
                        color: heatText(v),
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: "10px 6px",
                        textAlign: "center",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                      title={`${r.week} · ${heatmapScope} · ${d}: ${v.toFixed(1)}%`}
                    >
                      {v ? `${v.toFixed(1)}%` : "—"}
                    </div>
                  </td>
                );
              })}
            </tr>
          );
        })}

        <tr>
          <td
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: C.primary,
              whiteSpace: "nowrap",
              paddingRight: 8,
            }}
          >
            Total
          </td>
          {days.map((d) => {
            const v = Number(totalRow[d] || 0);

            return (
              <td key={d}>
                <div
                  style={{
                    background: heatColor(v),
                    color: heatText(v),
                    border: `1px solid ${C.primary}`,
                    borderRadius: 8,
                    padding: "10px 6px",
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                  title={`Average across displayed weeks · ${heatmapScope} · ${d}: ${v.toFixed(1)}%`}
                >
                  {v ? `${v.toFixed(1)}%` : "—"}
                </div>
              </td>
            );
          })}
        </tr>
      </>
    );
  })()}
</tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── 4. WORK MIX ───────────────────────────────────────────────────────────────
function WorkMix({
  bp,
  rawData,
  weekMixData,
  curByMkt,
  workMixCompare,
  workMixSignal,
  CUR_WK,
  scorecardBaselineMeta,
}) {
  const isMobile = bp === "mobile";
  const cols = isMobile ? 1 : 2;
  const [mixScope, setMixScope] = useState("ALL");

  const revenuePctByMarket = workMixCompare.map((r) => {
    const curTotal = num(r.completed) + num(r.completed0Rev);
    const baseTotal = num(r.completed_base) + num(r.completed0Rev_base);

    return {
      market: r.market,
      revenuePct:
        curTotal > 0 ? +((num(r.completed) / curTotal) * 100).toFixed(1) : 0,
      revenuePct_base:
        baseTotal > 0
          ? +((num(r.completed_base) / baseTotal) * 100).toFixed(1)
          : 0,
    };
  });

  const markets = useMemo(
    () =>
      [...new Set((rawData || []).map((r) => str(r.market)).filter(Boolean))].sort(),
    [rawData]
  );

  const marketWeekMixData = useMemo(() => {
    if (!rawData?.length) return [];

    const grouped = groupByWeek(rawData);
    const weekKeys = Object.keys(grouped).sort();

    return weekKeys.map((wk) => {
      const rows =
        mixScope === "ALL"
          ? grouped[wk] || []
          : (grouped[wk] || []).filter((r) => str(r.market) === mixScope);

      const a = aggWeek(rows);

      return {
        week: wk.slice(5),
        completed: a.completed_jobs,
        completed0Rev: a.completed_job_0_rev,
        warranty: a.warranty_checks,
        diagnostic: a.diagnostics,
        serviceCall: a.service_calls,
      };
    });
  }, [rawData, mixScope]);

  const selectedMixData = mixScope === "ALL" ? weekMixData : marketWeekMixData;

  const selectedMixSignal = useMemo(() => {
    if (mixScope === "ALL") return workMixSignal;

    const row = workMixCompare.find((r) => r.market === mixScope);

    return {
      completed: row?.completed || 0,
      completed_base: row?.completed_base || 0,
      completed0Rev: row?.completed0Rev || 0,
      completed0Rev_base: row?.completed0Rev_base || 0,
    };
  }, [mixScope, workMixSignal, workMixCompare]);

  const selectedCompletedDelta =
    selectedMixSignal.completed_base > 0
      ? +(
          ((selectedMixSignal.completed - selectedMixSignal.completed_base) /
            selectedMixSignal.completed_base) *
          100
        ).toFixed(1)
      : 0;

  const selectedCompleted0RevDelta =
    selectedMixSignal.completed0Rev_base > 0
      ? +(
          ((selectedMixSignal.completed0Rev -
            selectedMixSignal.completed0Rev_base) /
            selectedMixSignal.completed0Rev_base) *
          100
        ).toFixed(1)
      : 0;

  const LastPointDeltaLabel = ({
    x,
    y,
    index,
    value,
    data,
    compareKey,
  }) => {
    if (!data || index !== data.length - 1 || value == null) return null;

    const row = data[index];
    const base = row?.[compareKey];

    if (base == null || base === 0) return null;

    const pctChg = +(((value - base) / base) * 100).toFixed(1);

    return (
      <text
        x={x + 8}
        y={y - 8}
        textAnchor="start"
        fontSize={10}
        fontWeight={700}
        fill={pctChg >= 0 ? C.success : C.danger}
      >
        {pctChg >= 0 ? "+" : ""}
        {pctChg}% vs 12W
      </text>
    );
  };

  const trendWithBaseline = selectedMixData.map((r, idx, arr) => {
    if (idx !== arr.length - 1) {
      return {
        ...r,
        completed_base: null,
        completed0Rev_base: null,
      };
    }

    return {
      ...r,
      completed_base: selectedMixSignal.completed_base,
      completed0Rev_base: selectedMixSignal.completed0Rev_base,
    };
  });

  return (
    <div>
      <SectionHeader
        title="Work Mix Review"
        sub={
          scorecardBaselineMeta.weeksUsed > 0
            ? `${CUR_WK} vs last ${scorecardBaselineMeta.weeksUsed}-week average (${scorecardBaselineMeta.startWeek} to ${scorecardBaselineMeta.endWeek})`
            : "Revenue vs non-revenue activity mix"
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols},1fr)`,
          gap: 14,
        }}
      >
        <Card title="Activity Mix by Week">
          <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
            <LineChart
              data={selectedMixData}
              margin={{ top: 4, right: 4, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                dataKey="week"
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey="completed"
                stroke={C.success}
                strokeWidth={2}
                dot={{ r: 3, fill: C.success, strokeWidth: 0 }}
                name="Completed"
              />
              <Line
                type="monotone"
                dataKey="warranty"
                stroke={C.warning}
                strokeWidth={2}
                dot={{ r: 3, fill: C.warning, strokeWidth: 0 }}
                name="Warranty"
              />
              <Line
                type="monotone"
                dataKey="diagnostic"
                stroke={C.info}
                strokeWidth={2}
                dot={{ r: 3, fill: C.info, strokeWidth: 0 }}
                name="Diagnostic"
              />
              <Line
                type="monotone"
                dataKey="serviceCall"
                stroke={C.danger}
                strokeWidth={2}
                dot={{ r: 3, fill: C.danger, strokeWidth: 0 }}
                name="Service Call"
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Jobs per Day per Tech by Market — Current Week vs 12W Avg">
          <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
            <BarChart
              data={workMixCompare}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={C.border}
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
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
              <Bar
                dataKey="jobsPerDayPerTech"
                radius={[0, 3, 3, 0]}
                name="Jobs/Day/Tech"
              >
                {workMixCompare.map((r, i) => (
                  <Cell
                    key={i}
                    fill={
                      r.jobsPerDayPerTech_12w > 0
                        ? r.jobsPerDayPerTech >= r.jobsPerDayPerTech_12w
                          ? C.success
                          : r.jobsPerDayPerTech >= r.jobsPerDayPerTech_12w * 0.9
                          ? C.warning
                          : C.danger
                        : C.subtle
                    }
                  />
                ))}
              </Bar>
              <Bar
                dataKey="jobsPerDayPerTech_12w"
                radius={[0, 3, 3, 0]}
                fill={C.subtle}
                name="Jobs/Day/Tech (12W Avg)"
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card
          title={`Revenue Capacity Mix vs Non-Revenue Mix by Week — ${mixScope}`}
          style={{ gridColumn: "1/-1" }}
        >
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            {["ALL", ...markets].map((market) => (
              <button
                key={market}
                onClick={() => setMixScope(market)}
                style={{
                  background: mixScope === market ? C.info : C.surface,
                  color: mixScope === market ? "#fff" : C.muted,
                  border: `1px solid ${mixScope === market ? C.info : C.border}`,
                  borderRadius: 20,
                  padding: "5px 14px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {market}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "10px 12px",
                minWidth: 220,
              }}
            >
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>
                Revenue Capacity Mix
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.primary }}>
                {Math.round(selectedMixSignal.completed)}
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>
                vs 12W avg {selectedMixSignal.completed_base.toFixed(1)}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: selectedCompletedDelta >= 0 ? C.success : C.danger,
                  marginTop: 4,
                }}
              >
                {selectedCompletedDelta >= 0 ? "+" : ""}
                {selectedCompletedDelta}% relative change
              </div>
            </div>

            <div
              style={{
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "10px 12px",
                minWidth: 220,
              }}
            >
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>
                Non-Revenue Mix
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.primary }}>
                {Math.round(selectedMixSignal.completed0Rev)}
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>
                vs 12W avg {selectedMixSignal.completed0Rev_base.toFixed(1)}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: selectedCompleted0RevDelta >= 0 ? C.danger : C.success,
                  marginTop: 4,
                }}
              >
                {selectedCompleted0RevDelta >= 0 ? "+" : ""}
                {selectedCompleted0RevDelta}% relative change
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={isMobile ? 220 : 260}>
            <LineChart
              data={trendWithBaseline}
              margin={{ top: 18, right: 48, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                dataKey="week"
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />

              <Line
                type="monotone"
                dataKey="completed"
                stroke={C.success}
                strokeWidth={2.5}
                dot={{ r: 3, fill: C.success, strokeWidth: 0 }}
                name="Revenue Capacity Mix (Completed Job)"
                label={
                  <LastPointDeltaLabel
                    data={trendWithBaseline}
                    compareKey="completed_base"
                  />
                }
              />

              <Line
                type="monotone"
                dataKey="completed0Rev"
                stroke={C.purple}
                strokeWidth={2.5}
                dot={{ r: 3, fill: C.purple, strokeWidth: 0 }}
                name="Non-Revenue Mix (Completed Job 0 Rev)"
                label={
                  <LastPointDeltaLabel
                    data={trendWithBaseline}
                    compareKey="completed0Rev_base"
                  />
                }
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card
          title="Current Week vs 12W Avg — Revenue % by Market"
          style={{ gridColumn: "1/-1" }}
        >
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 260}>
            <BarChart
              data={revenuePctByMarket}
              margin={{ top: 16, right: 4, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                dataKey="market"
                tick={{ fill: C.muted, fontSize: isMobile ? 8 : 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                unit="%"
              />
              <Tooltip content={<TT showDelta={true} />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar
                dataKey="revenuePct"
                fill={C.success}
                radius={[3, 3, 0, 0]}
                name={`Revenue % (${String(CUR_WK).slice(5)})`}
                label={<DeltaLabel data={revenuePctByMarket} pwKey="revenuePct_base" />}
              />
              <Bar
                dataKey="revenuePct_base"
                fill={C.subtle}
                radius={[3, 3, 0, 0]}
                name="Revenue % (12W Avg)"
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card
          title="Current Week vs 12W Avg — Non-Revenue % by Market"
          style={{ gridColumn: "1/-1" }}
        >
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 260}>
            <BarChart
              data={workMixCompare}
              margin={{ top: 16, right: 4, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                dataKey="market"
                tick={{ fill: C.muted, fontSize: isMobile ? 8 : 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                unit="%"
              />
              <Tooltip content={<TT showDelta={true} />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar
                dataKey="nonRevPct"
                fill={C.danger}
                radius={[3, 3, 0, 0]}
                name={`Non-Rev% (${String(CUR_WK).slice(5)})`}
                label={<DeltaLabel data={workMixCompare} pwKey="nonRevPct_base" />}
              />
              <Bar
                dataKey="nonRevPct_base"
                fill={C.subtle}
                radius={[3, 3, 0, 0]}
                name="Non-Rev% (12W Avg)"
              />
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

      return asc ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0);
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
    const fv =
      fmt === "%"
        ? `${v.toFixed(1)}%`
        : fmt === "x"
        ? `${v.toFixed(1)}x`
        : Math.round(v);
    return (
      <td
        style={{ padding: "11px 12px", color: col, fontWeight: 600, fontSize: 12 }}
      >
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
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{ color: C.primary, fontWeight: 800, fontSize: 14 }}
                >
                  {r.market}
                </span>
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

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 6,
                  marginBottom: 8,
                }}
              >
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

                  const fv =
                    fmt === "%"
                      ? `${val.toFixed(1)}%`
                      : fmt === "x"
                      ? `${val.toFixed(1)}x`
                      : Math.round(val);

                  return (
                    <div
                      key={lbl}
                      style={{
                        background: C.panel,
                        borderRadius: 6,
                        padding: "6px 8px",
                      }}
                    >
                      <div
                        style={{
                          color: C.muted,
                          fontSize: 9,
                          fontWeight: 600,
                          textTransform: "uppercase",
                        }}
                      >
                        {lbl}
                      </div>
                      <div style={{ color: col, fontWeight: 700, fontSize: 13 }}>
                        {fv}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  color: C.muted,
                  fontSize: 11,
                  padding: "6px 8px",
                  background: C.panel,
                  borderRadius: 6,
                }}
              >
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
                  <td
                    style={{
                      padding: "11px 12px",
                      color: C.primary,
                      fontWeight: 700,
                    }}
                  >
                    {r.market}
                  </td>
                  <td style={{ padding: "11px 12px", color: C.secondary }}>
                    {r.leads}
                  </td>
                  {cell(r.bookingRate, 35, 55)}
                  {cell(r.convRate, 25, 50)}
                  <td style={{ padding: "11px 12px", color: C.secondary }}>
                    {r.techs}
                  </td>
                  <td style={{ padding: "11px 12px", color: C.secondary }}>
                    {r.slots}
                  </td>
                  {cell(r.utilization, 50, 75)}
                  <td style={{ padding: "11px 12px", color: C.secondary }}>
                    {r.completed_jobs}
                  </td>
                  {cell(r.nonRevPct, 0, 30)}
                  <td style={{ padding: "11px 12px", color: C.secondary }}>
                    {r.lsr.toFixed(1)}x
                  </td>
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
                      <div
                        style={{
                          fontSize: 10,
                          color: C.subtle,
                          marginTop: 3,
                        }}
                      >
                        {r.baseline.avgLeads !== null &&
                          `Avg leads: ${Math.round(r.baseline.avgLeads)}`}
                        {r.baseline.avgBookRate !== null &&
                          ` · Bk: ${(r.baseline.avgBookRate * 100).toFixed(0)}%`}
                        {r.baseline.avgCompRate !== null &&
                          ` · Cmp: ${(r.baseline.avgCompRate * 100).toFixed(0)}%`}
                        {r.baseline.avgUtilRate !== null &&
                          ` · Util: ${(r.baseline.avgUtilRate * 100).toFixed(0)}%`}
                      </div>
                    )}

                    {r.baseline?.weeksUsed === 0 && (
                      <div
                        style={{
                          fontSize: 10,
                          color: C.warning,
                          marginTop: 3,
                        }}
                      >
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
