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
