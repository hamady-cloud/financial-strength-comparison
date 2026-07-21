"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  allMunicipalities,
  benchmarkFor,
  formatMetric,
  metricValue,
  metrics,
  municipalities,
  years,
  type MetricKey,
  type Municipality,
} from "./data";

type View = "ranking" | "scatter" | "detail" | "wakayama" | "guide" | "sources";

const nav: { id: View; label: string; index: string }[] = [
  { id: "ranking", label: "全国ランキング", index: "01" },
  { id: "scatter", label: "指標マップ", index: "02" },
  { id: "detail", label: "団体カルテ", index: "03" },
  { id: "wakayama", label: "和歌山ビュー", index: "04" },
  { id: "guide", label: "やさしい指標解説", index: "05" },
  { id: "sources", label: "出典・注意", index: "06" },
];

function Trend({ values, good = false }: { values: number[]; good?: boolean }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return (
    <div className="spark" aria-label={`5年推移 ${values.join("、")}`}>
      {values.map((v, i) => (
        <i key={i} style={{ height: `${24 + ((v - min) / range) * 60}%` }} className={good ? "good" : ""} />
      ))}
    </div>
  );
}

function DownloadButton({ rows, metric }: { rows: Municipality[]; metric: MetricKey }) {
  function download() {
    const header = ["団体コード", "団体名", "都道府県", "類似団体区分", metrics[metric].label, "人口"];
    const lines = rows.map((m) => [m.code, m.name, m.pref, m.group, metricValue(m, metric), m.population]);
    const csv = "\uFEFF" + [header, ...lines].map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `municipal-fiscal-${metric}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return <button className="button secondary" onClick={download}><span>↓</span> CSVを出力</button>;
}

export default function Dashboard() {
  const [view, setView] = useState<View>("ranking");
  const [year, setYear] = useState(2023);
  const [metric, setMetric] = useState<MetricKey>("ordinaryBalance");
  const [pref, setPref] = useState("すべて");
  const [group, setGroup] = useState("すべて");
  const [population, setPopulation] = useState(0);
  const [descending, setDescending] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState("30201");
  const [xMetric, setXMetric] = useState<MetricKey>("ordinaryBalance");
  const [yMetric, setYMetric] = useState<MetricKey>("futureBurden");
  const selected = allMunicipalities.find((m) => m.code === selectedCode) ?? municipalities[0];

  // URL is an external state source; hydrate filters once after the client mounts.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view") as View | null;
    const m = params.get("metric") as MetricKey | null;
    if (v && nav.some((n) => n.id === v)) setView(v);
    if (m && metrics[m]) setMetric(m);
    const municipality = params.get("municipality");
    if (municipality && allMunicipalities.some((item) => item.code === municipality)) setSelectedCode(municipality);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("view", view);
    params.set("year", String(year));
    params.set("metric", metric);
    if (view === "detail") params.set("municipality", selectedCode);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [view, year, metric, selectedCode]);

  const prefs = useMemo(() => ["すべて", ...Array.from(new Set(allMunicipalities.map((m) => m.pref)))], []);
  const groups = useMemo(() => ["すべて", ...Array.from(new Set(allMunicipalities.map((m) => m.group)))], []);
  const filtered = useMemo(() => allMunicipalities
    .filter((m) => (pref === "すべて" || m.pref === pref) && (group === "すべて" || m.group === group))
    .filter((m) => m.population >= population && (m.name.includes(search) || m.pref.includes(search)))
    .sort((a, b) => (metricValue(b, metric) - metricValue(a, metric)) * (descending ? 1 : -1)),
  [pref, group, population, search, metric, descending]);

  function openDetail(item: Municipality) {
    setSelectedCode(item.code);
    setView("detail");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span>F</span></div>
          <div><strong>Fiscal Lens</strong><small>市町村財政を、解像する。</small></div>
        </div>
        <nav aria-label="メインナビゲーション">
          {nav.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>
              <span>{item.index}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          <div><b>デモデータで表示中</b><small>公的統計接続前のUI検証版</small></div>
        </div>
        <div className="sidebar-footer">普通会計・決算統計ベース<br />UI v0.2 · 指標解説を追加</div>
      </aside>

      <main>
        <header className="topbar">
          <div className="mobile-brand"><b>Fiscal Lens</b><span>財政ダッシュボード</span></div>
          <div className="year-control"><span>表示年度</span><select value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}年度</option>)}</select></div>
          <button className="icon-button" aria-label="共有URLをコピー" onClick={() => navigator.clipboard?.writeText(window.location.href)}>↗</button>
        </header>

        <div className="mobile-nav">{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>{item.label}</button>)}</div>

        {view === "ranking" && <Ranking rows={filtered} metric={metric} setMetric={setMetric} pref={pref} setPref={setPref} prefs={prefs} group={group} setGroup={setGroup} groups={groups} population={population} setPopulation={setPopulation} descending={descending} setDescending={setDescending} search={search} setSearch={setSearch} openDetail={openDetail} />}
        {view === "scatter" && <Scatter xMetric={xMetric} setXMetric={setXMetric} yMetric={yMetric} setYMetric={setYMetric} search={search} setSearch={setSearch} openDetail={openDetail} />}
        {view === "detail" && <Detail selected={selected} setSelectedCode={setSelectedCode} metric={metric} setMetric={setMetric} />}
        {view === "wakayama" && <Wakayama openDetail={openDetail} />}
        {view === "guide" && <BeginnerGuide />}
        {view === "sources" && <Sources />}

        <footer className="main-footer"><span>本サイトは非公式の分析支援ツールです。正確な値は必ず公表元をご確認ください。</span><div><button onClick={() => setView("guide")}>数値の読み方</button><button onClick={() => setView("sources")}>出典・免責を見る →</button></div></footer>
      </main>
    </div>
  );
}

function PageIntro({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="page-intro"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</div>;
}

const metricHelp: Record<MetricKey, string> = {
  fiscalStrength: "必要な行政サービスにかかる標準的な費用を、その自治体の標準的な税収でどれだけまかなえるかを見る指標です。高いほど、自分たちの収入で行政を運営しやすい傾向があります。",
  ordinaryBalance: "毎年自由に使える収入のうち、人件費・福祉・借金返済など、毎年続く支出に使う割合です。高いほど、新しい事業に回せるお金の余裕が小さい傾向があります。",
  debtService: "自治体の収入規模に対して、実質的な借金返済の負担がどれくらいあるかを示す割合です。低いほど、返済負担が軽い傾向があります。",
  futureBurden: "将来支払う可能性がある借金などの負担から、基金などを差し引き、自治体の収入規模と比べた指標です。低いほど、将来の負担が小さい傾向があります。",
  fundBalance: "主な基金（自治体の貯金）を収入規模で割った、このツール独自の比較指標です。高いほど、災害や急な支出への備えが厚い傾向があります。",
  personnel: "毎年自由に使える収入のうち、職員の給与など人件費に充てた割合です。単独で良し悪しを決めず、似た規模の自治体と比べて読みます。",
};

const groupHelp: Record<string, string> = {
  政令市: "政令指定都市のことです。人口や行政規模が大きく、都道府県が行う仕事の一部も担う都市です。",
  中核市: "人口規模が比較的大きく、保健所の設置など、一部の行政権限を都道府県から移された都市です。",
  "都市Ⅱ": "人口や産業構造が近い「市」をまとめた類似団体区分の、このデモでの簡略表示です。「Ⅱ」は同じ市の中の規模帯を表します。",
  "町村Ⅰ": "人口や産業構造が近い町・村をまとめた、このデモでの簡略区分です。「Ⅰ」は比較的小規模な町村グループを表します。",
  "町村Ⅱ": "人口や産業構造が近い町・村をまとめた、このデモでの簡略区分です。「Ⅱ」はⅠより人口規模が大きい町村グループを表します。",
};

function HelpTip({ label, text, compact = false }: { label: string; text: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const id = useId();

  function toggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width));
      const showAbove = rect.bottom + 190 > window.innerHeight;
      setPosition({ top: showAbove ? Math.max(12, rect.top - 174) : rect.bottom + 8, left });
    }
    setOpen((value) => !value);
  }

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function closeOnViewportChange() { setOpen(false); }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  return <span className={`help-tip ${compact ? "compact" : ""}`}>
    <button ref={buttonRef} type="button" className="help-trigger" aria-label={`${label}の意味を表示`} aria-expanded={open} aria-controls={id} onClick={toggle}>?</button>
    {open && typeof document !== "undefined" && createPortal(
      <div ref={popoverRef} id={id} className="help-popover" role="dialog" aria-label={`${label}の説明`} style={position}>
        <div><strong>{label}</strong><button type="button" aria-label="説明を閉じる" onClick={() => setOpen(false)}>×</button></div>
        <p>{text}</p>
      </div>,
      document.body,
    )}
  </span>;
}

function GroupTag({ group, accent = false }: { group: string; accent?: boolean }) {
  const explanation = groupHelp[group] ?? "人口や産業構造が近い自治体をまとめた比較グループです。この画面ではデモ用に簡略化した区分名を表示しています。";
  return <span className="group-tag-wrap"><span className={`tag ${accent ? "accent" : ""}`}>{group}</span><HelpTip label={group} text={explanation} compact /></span>;
}

function Ranking(props: {
  rows: Municipality[]; metric: MetricKey; setMetric: (v: MetricKey) => void; pref: string; setPref: (v: string) => void; prefs: string[];
  group: string; setGroup: (v: string) => void; groups: string[]; population: number; setPopulation: (v: number) => void;
  descending: boolean; setDescending: (v: boolean) => void; search: string; setSearch: (v: string) => void; openDetail: (m: Municipality) => void;
}) {
  const { rows, metric } = props;
  const median = rows.length ? [...rows].sort((a, b) => metricValue(a, metric) - metricValue(b, metric))[Math.floor(rows.length / 2)] : null;
  return <section className="page">
    <PageIntro eyebrow="NATIONAL BENCHMARK" title="全国ランキング" text="同じ条件の自治体を並べ、財政の現在地と変化を俯瞰します。" action={<DownloadButton rows={rows} metric={metric} />} />
    <div className="insight-strip">
      <div><small>対象団体</small><strong>{rows.length}<em>団体</em></strong><span>デモ収録 {allMunicipalities.length}団体</span></div>
      <div><small>中央値</small><strong>{median ? formatMetric(metricValue(median, metric), metric) : "—"}</strong><span>{metrics[metric].label}</span></div>
      <div className="insight"><span className="insight-mark">!</span><p><b>読み方のヒント</b>{metrics[metric].better === "low" ? "値が高い団体ほど、継続的な確認が必要です。" : "値が低い団体ほど、相対的な余力が小さい傾向です。"}</p></div>
    </div>
    <div className="filter-panel">
      <label className="search-field"><span>⌕</span><input value={props.search} onChange={(e) => props.setSearch(e.target.value)} placeholder="団体名・都道府県で検索" /></label>
      <label><span>都道府県</span><select value={props.pref} onChange={(e) => props.setPref(e.target.value)}>{props.prefs.map((v) => <option key={v}>{v}</option>)}</select></label>
      <label><span>類似団体区分</span><select value={props.group} onChange={(e) => props.setGroup(e.target.value)}>{props.groups.map((v) => <option key={v}>{v}</option>)}</select></label>
      <label><span>人口下限</span><select value={props.population} onChange={(e) => props.setPopulation(Number(e.target.value))}><option value={0}>指定なし</option><option value={10000}>1万人以上</option><option value={100000}>10万人以上</option><option value={500000}>50万人以上</option></select></label>
      <label><span>表示指標</span><select value={metric} onChange={(e) => props.setMetric(e.target.value as MetricKey)}>{Object.entries(metrics).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
    </div>
    <div className="table-card">
      <div className="table-head"><div><b>{metrics[metric].label}ランキング</b><span>比較条件に該当する団体</span></div><button className="sort-button" onClick={() => props.setDescending(!props.descending)}>{props.descending ? "高い順 ↓" : "低い順 ↑"}</button></div>
      <div className="table-scroll"><table><thead><tr><th>順位</th><th>団体</th><th><span className="header-with-help">類似区分<HelpTip label="類似団体区分" text="人口や産業構造が近い自治体をまとめた比較グループです。この画面では、分かりやすさのためデモ用の簡略名を表示しています。" compact /></span></th><th>指標値</th><th>類似団体平均との差</th><th>前年度比</th><th>5年トレンド</th><th /></tr></thead>
        <tbody>{rows.slice(0, 50).map((m, i) => {
          const value = metricValue(m, metric); const diff = value - benchmarkFor(m, metric); const yoy = m.trend[4] - m.trend[3];
          return <tr key={m.code}><td><span className={`rank ${i < 3 ? "top" : ""}`}>{i + 1}</span></td><td><button className="entity" onClick={() => props.openDetail(m)}><b>{m.name}</b><small>{m.pref} · {m.population.toLocaleString()}人</small></button></td><td><GroupTag group={m.group} /></td><td><strong>{formatMetric(value, metric)}</strong></td><td><span className={diff > 0 ? "delta bad" : "delta good"}>{diff > 0 ? "+" : ""}{diff.toFixed(metrics[metric].digits)}{metrics[metric].unit}</span></td><td><span className={yoy > 0 ? "delta bad" : "delta good"}>{yoy > 0 ? "▲" : "▼"} {Math.abs(yoy).toFixed(1)}</span></td><td><Trend values={m.trend} good={m.trend[4] <= m.trend[0]} /></td><td><button className="row-arrow" aria-label={`${m.name}の詳細`} onClick={() => props.openDetail(m)}>→</button></td></tr>;
        })}</tbody></table>{rows.length === 0 && <div className="empty">条件に合う団体がありません。フィルタを変更してください。</div>}</div>
    </div>
  </section>;
}

function Scatter({ xMetric, setXMetric, yMetric, setYMetric, search, setSearch, openDetail }: { xMetric: MetricKey; setXMetric: (v: MetricKey) => void; yMetric: MetricKey; setYMetric: (v: MetricKey) => void; search: string; setSearch: (v: string) => void; openDetail: (m: Municipality) => void }) {
  const xValues = allMunicipalities.map((m) => metricValue(m, xMetric)); const yValues = allMunicipalities.map((m) => metricValue(m, yMetric));
  const minX = Math.min(...xValues); const maxX = Math.max(...xValues); const minY = Math.min(...yValues); const maxY = Math.max(...yValues);
  const avgX = xValues.reduce((a, b) => a + b, 0) / xValues.length; const avgY = yValues.reduce((a, b) => a + b, 0) / yValues.length;
  const match = allMunicipalities.find((m) => m.name.includes(search));
  return <section className="page">
    <PageIntro eyebrow="RELATIONSHIP MAP" title="指標マップ" text="2つの指標を重ね、単一指標では見えない財政構造を捉えます。" />
    <div className="scatter-layout"><div className="chart-card">
      <div className="chart-toolbar"><label><span>X軸</span><select value={xMetric} onChange={(e) => setXMetric(e.target.value as MetricKey)}>{Object.entries(metrics).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label><span className="cross">×</span><label><span>Y軸</span><select value={yMetric} onChange={(e) => setYMetric(e.target.value as MetricKey)}>{Object.entries(metrics).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label><label className="search-field compact"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="団体をハイライト" /></label></div>
      <div className="scatter-chart">
        <div className="danger-zone"><span>注視ゾーン</span></div><div className="axis-line x" style={{ left: `${((avgX - minX) / (maxX - minX || 1)) * 100}%` }} /><div className="axis-line y" style={{ bottom: `${((avgY - minY) / (maxY - minY || 1)) * 100}%` }} />
        {allMunicipalities.map((m) => { const left = ((metricValue(m, xMetric) - minX) / (maxX - minX || 1)) * 92 + 4; const bottom = ((metricValue(m, yMetric) - minY) / (maxY - minY || 1)) * 84 + 7; const highlight = match?.code === m.code; return <button key={m.code} className={`point ${m.pref === "和歌山県" ? "wakayama" : ""} ${highlight ? "highlight" : ""}`} style={{ left: `${left}%`, bottom: `${bottom}%`, width: `${Math.max(9, Math.min(24, Math.sqrt(m.population) / 65))}px`, height: `${Math.max(9, Math.min(24, Math.sqrt(m.population) / 65))}px` }} onClick={() => openDetail(m)} aria-label={`${m.name} ${formatMetric(metricValue(m, xMetric), xMetric)} / ${formatMetric(metricValue(m, yMetric), yMetric)}`}><span>{m.name}</span></button>; })}
        <div className="axis-label left">{metrics[yMetric].label} →</div><div className="axis-label bottom">{metrics[xMetric].label} →</div>
      </div><div className="legend"><span><i className="dot teal" />和歌山県</span><span><i className="dot navy" />その他</span><span>破線：デモ収録団体の平均</span></div>
    </div><aside className="map-insight"><span className="eyebrow">QUICK READ</span><h2>右上ほど、複合的な負担が大きい</h2><p>水準だけでなく、自治体規模・類似団体平均との差・推移をあわせて確認してください。</p><div className="mini-stat"><span>平均 X</span><b>{formatMetric(avgX, xMetric)}</b></div><div className="mini-stat"><span>平均 Y</span><b>{formatMetric(avgY, yMetric)}</b></div><div className="callout"><b>点の大きさ</b><span>住民基本台帳人口</span></div></aside></div>
  </section>;
}

function Detail({ selected, setSelectedCode, metric, setMetric }: { selected: Municipality; setSelectedCode: (v: string) => void; metric: MetricKey; setMetric: (v: MetricKey) => void }) {
  const peerRows = allMunicipalities.filter((m) => m.group === selected.group); const nationalRank = [...allMunicipalities].sort((a, b) => a.ordinaryBalance - b.ordinaryBalance).findIndex((m) => m.code === selected.code) + 1; const prefRank = [...allMunicipalities.filter((m) => m.pref === selected.pref)].sort((a, b) => a.ordinaryBalance - b.ordinaryBalance).findIndex((m) => m.code === selected.code) + 1;
  const cards: MetricKey[] = ["fiscalStrength", "ordinaryBalance", "debtService", "futureBurden", "fundBalance", "personnel"];
  return <section className="page">
    <PageIntro eyebrow="MUNICIPALITY PROFILE" title="団体カルテ" text="1団体の水準・変化・要因を、一枚で説明できる形にまとめます。" />
    <div className="entity-picker"><label><span>対象団体</span><select value={selected.code} onChange={(e) => setSelectedCode(e.target.value)}>{allMunicipalities.map((m) => <option key={m.code} value={m.code}>{m.pref}　{m.name}</option>)}</select></label><div><GroupTag group={selected.group} accent /><span>{selected.population.toLocaleString()}人</span><span>団体コード {selected.code}</span></div></div>
    <div className="profile-hero"><div><span className="eyebrow">FISCAL SNAPSHOT</span><h2>{selected.name}</h2><p>{selected.pref}における経常収支比率順位 <b>{prefRank}位</b> ／ デモ収録全国順位 <b>{nationalRank}位</b></p></div><div className="cause-badge"><span>硬直化の主因</span><strong>{selected.cause}</strong><small>経常経費の構成比から判定</small></div></div>
    <div className="metric-grid">{cards.map((key) => { const v = metricValue(selected, key); const diff = v - benchmarkFor(selected, key); const isBad = metrics[key].better === "low" ? diff > 0 : diff < 0; return <div className="metric-card" key={key}><div><span>{metrics[key].label}</span><HelpTip label={metrics[key].label} text={metricHelp[key]} /></div><strong>{formatMetric(v, key)}</strong><p className={isBad ? "bad-text" : "good-text"}>類似団体平均 {diff > 0 ? "+" : ""}{diff.toFixed(metrics[key].digits)}{metrics[key].unit}</p><div className="range"><i style={{ width: `${Math.min(100, Math.max(8, (v / (key === "fiscalStrength" ? 1.8 : key === "futureBurden" ? 280 : 140)) * 100))}%` }} /></div></div>; })}</div>
    <div className="detail-grid"><div className="panel"><div className="panel-title"><div><span className="eyebrow">10-YEAR TREND</span><h3>指標の推移</h3></div><select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)}>{Object.entries(metrics).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div><div className="line-chart"><div className="grid-lines" /><div className="trend-columns">{selected.trend.map((v, i) => <div key={i}><span style={{ bottom: `${18 + ((v - Math.min(...selected.trend)) / (Math.max(...selected.trend) - Math.min(...selected.trend) || 1)) * 62}%` }}>{v}</span><i style={{ height: `${18 + ((v - Math.min(...selected.trend)) / (Math.max(...selected.trend) - Math.min(...selected.trend) || 1)) * 62}%` }} /><small>{2019 + i}</small></div>)}</div></div></div>
      <div className="panel"><div className="panel-title"><div><span className="eyebrow">COMPOSITION</span><h3>経常収支比率の内訳</h3></div></div><div className="composition"><div className="donut"><b>{selected.ordinaryBalance}</b><span>%</span></div><div className="composition-list"><p><span><i style={{ background: "#12364a" }} />人件費</span><b>{selected.personnel}%</b></p><p><span><i style={{ background: "#1b8a88" }} />扶助費</span><b>{(selected.ordinaryBalance * .31).toFixed(1)}%</b></p><p><span><i style={{ background: "#e1765d" }} />公債費</span><b>{(selected.ordinaryBalance * .22).toFixed(1)}%</b></p><p><span><i style={{ background: "#d8c8a9" }} />その他</span><b>{Math.max(0, selected.ordinaryBalance - selected.personnel - selected.ordinaryBalance * .53).toFixed(1)}%</b></p></div></div><div className="cause-note"><b>{selected.cause}</b><span>同区分の構成比と比較し、寄与の大きい費目を表示しています。</span></div></div></div>
    <div className="table-card compact-table"><div className="table-head"><div><b>類似団体との比較</b><span className="group-summary"><GroupTag group={selected.group} />{peerRows.length}団体</span></div></div><div className="table-scroll"><table><thead><tr><th>団体</th><th>財政力指数</th><th>経常収支比率</th><th>実質公債費比率</th><th>基金残高比率</th></tr></thead><tbody>{peerRows.slice(0, 6).map((m) => <tr key={m.code} className={m.code === selected.code ? "selected-row" : ""}><td><b>{m.name}</b></td><td>{m.fiscalStrength.toFixed(2)}</td><td>{m.ordinaryBalance.toFixed(1)}%</td><td>{m.debtService.toFixed(1)}%</td><td>{m.fundBalance.toFixed(1)}%</td></tr>)}</tbody></table></div></div>
  </section>;
}

function Wakayama({ openDetail }: { openDetail: (m: Municipality) => void }) {
  const keys: MetricKey[] = ["fiscalStrength", "ordinaryBalance", "debtService", "futureBurden", "fundBalance"];
  const worst = [...municipalities].sort((a, b) => (b.trend[4] - b.trend[2]) - (a.trend[4] - a.trend[2])).slice(0, 4);
  function heatClass(m: Municipality, key: MetricKey) { const vals = municipalities.map((x) => metricValue(x, key)).sort((a, b) => a - b); const rank = vals.indexOf(metricValue(m, key)) / vals.length; const badness = metrics[key].better === "low" ? rank : 1 - rank; return badness > .72 ? "heat-high" : badness > .38 ? "heat-mid" : "heat-low"; }
  return <section className="page">
    <PageIntro eyebrow="WAKAYAMA FOCUS" title="和歌山ビュー" text="県内30市町村を同じ物差しで見渡し、変化の大きい団体を抽出します。" action={<DownloadButton rows={municipalities} metric="ordinaryBalance" />} />
    <div className="pref-hero"><div><span>和歌山県</span><h2>30市町村の財政を、一望する。</h2><p>色は県内での相対的な位置を示します。濃い色がただちに「危険」を意味するものではありません。</p></div><div className="pref-stat"><b>30</b><span>municipalities</span></div></div>
    <div className="wakayama-grid"><div className="table-card heatmap-card"><div className="table-head"><div><b>県内ヒートマップ</b><span>各指標の県内分布</span></div><div className="heat-legend"><span>良好</span><i className="heat-low" /><i className="heat-mid" /><i className="heat-high" /><span>注視</span></div></div><div className="table-scroll"><table className="heatmap"><thead><tr><th>団体</th>{keys.map((key) => <th key={key}>{metrics[key].label}</th>)}</tr></thead><tbody>{municipalities.map((m) => <tr key={m.code}><td><div className="heat-entity"><button className="entity" onClick={() => openDetail(m)}><b>{m.name}</b></button><GroupTag group={m.group} /></div></td>{keys.map((key) => <td key={key}><span className={heatClass(m, key)}>{formatMetric(metricValue(m, key), key)}</span></td>)}</tr>)}</tbody></table></div></div>
      <aside className="trend-panel"><span className="eyebrow">3-YEAR CHANGE</span><h2>悪化幅の大きい団体</h2><p>経常収支比率が直近3年で上昇した順</p>{worst.map((m, i) => <button key={m.code} onClick={() => openDetail(m)}><span className="trend-rank">0{i + 1}</span><div><b>{m.name}</b><small>{m.cause}</small></div><strong>+{(m.trend[4] - m.trend[2]).toFixed(1)}<em>pt</em></strong></button>)}<div className="trend-note"><b>注目点</b><p>単年度の変化ではなく、費目別の寄与とあわせて確認してください。</p></div></aside></div>
  </section>;
}

function BeginnerGuide() {
  const guideMetrics = [
    {
      number: "01",
      name: "財政力指数",
      question: "自分たちで集められるお金で、必要な仕事をどれくらいまかなえる？",
      simple: "まちの「自分でお金を用意する力」を見る数字です。国から配られる地方交付税に、どのくらい頼らずにすむかを考える手がかりになります。",
      formulaTop: "基準財政収入額",
      formulaBottom: "基準財政需要額",
      suffix: "3年間の平均",
      terms: "「収入額」は標準的に見込める税収など、「需要額」は標準的な行政サービスに必要とされる費用です。実際の歳入・歳出の総額そのものではありません。",
      example: "収入額が70億円、必要額が100億円なら、70 ÷ 100 ＝ 0.70。3年分を平均して表示します。",
      high: "高いほど、税収など自前のお金で対応できる割合が大きい傾向があります。",
      low: "低いほど、地方交付税など国からの支えが重要になります。",
      caution: "1.00未満だから直ちに危険、という意味ではありません。人口規模や産業構造が近い自治体と比べます。",
    },
    {
      number: "02",
      name: "経常収支比率",
      question: "毎年自由に使えるお金のうち、固定費でどれくらい埋まっている？",
      simple: "家計でいえば、毎月の給料のうち、家賃・食費・ローンなど毎月ほぼ必ず出ていくお金が占める割合です。まちの「お金の動かしやすさ」がわかります。",
      formulaTop: "毎年続く経費に使った一般財源",
      formulaBottom: "毎年入る、使い道が決まっていない一般財源",
      suffix: "× 100",
      terms: "一般財源とは、税金や地方交付税など、使い道を自治体が比較的自由に決められるお金です。",
      example: "自由に使える収入が100億円、そのうち固定的な経費が92億円なら、92 ÷ 100 × 100 ＝ 92%。新しい仕事に回せる余地は単純化すると8%です。",
      high: "高いほど固定費の割合が大きく、新しい事業や急な支出に対応しにくい傾向があります。",
      low: "低いほど、政策や臨時の支出に回せる余地がある傾向があります。",
      caution: "法律上の一律な危険ラインはありません。必要な福祉サービスが多いなど、高くなる理由を内訳で確認します。",
    },
    {
      number: "03",
      name: "実質公債費比率",
      question: "1年間の収入規模に対して、借金返済の負担はどれくらい？",
      simple: "まちのローン返済負担を見る数字です。一般会計の返済だけでなく、公営企業などの返済を実質的に負担している分も考えます。",
      formulaTop: "その年に実質的に負担した借金返済額",
      formulaBottom: "標準財政規模などをもとにした額",
      suffix: "× 100・3年間の平均",
      terms: "標準財政規模は、その自治体が標準的に持つ経常的な一般財源の大きさです。公式計算では、国から補われる返済財源などを調整します。",
      example: "説明を簡単にして、収入規模が1,000億円、実質的な返済負担が120億円なら、120 ÷ 1,000 × 100 ＝ 12%。",
      high: "高いほど借金返済の負担が重く、ほかの仕事に使えるお金が少なくなりやすいです。",
      low: "低いほど、その年の収入に対する返済負担は小さい傾向があります。",
      caution: "18%以上は地方債を発行するときに国の許可が必要となり、25%以上は早期健全化基準です。ただし、公式値は複数の調整を含みます。",
    },
    {
      number: "04",
      name: "将来負担比率",
      question: "将来払う約束になっている負担は、今の収入規模に対してどれくらい？",
      simple: "いま残っている借金や、将来負担する可能性が高い金額から、返済に使える基金などを差し引いて測ります。家計でいえば「住宅ローンなどの残高」と「返済用の貯金」をまとめて見るイメージです。",
      formulaTop: "将来負担する額 − 返済に使える基金など",
      formulaBottom: "標準財政規模などをもとにした額",
      suffix: "× 100",
      terms: "将来負担には地方債残高のほか、一部事務組合や第三セクターなどへの負担が含まれることがあります。",
      example: "説明を簡単にして、差し引き後の将来負担が800億円、収入規模が1,000億円なら、800 ÷ 1,000 × 100 ＝ 80%。",
      high: "高いほど、将来の世代が負担する可能性のある金額が大きい傾向があります。",
      low: "低いほど、収入規模に対する将来負担は小さい傾向があります。負担額が基金などを下回る場合は「—」になることもあります。",
      caution: "一般の市町村では350%が早期健全化基準です。政令指定都市などは扱いが異なるため、公式資料も確認します。",
    },
    {
      number: "05",
      name: "基金残高比率",
      question: "もしもの時に使える貯金は、まちの収入規模に対してどれくらい？",
      simple: "自治体の主な貯金である基金を、自治体の大きさに合わせて比べるための数字です。金額だけでは大都市が大きく見えるため、収入規模で割ります。",
      formulaTop: "財政調整基金 ＋ 減債基金 ＋ その他特定目的基金",
      formulaBottom: "標準財政規模",
      suffix: "× 100",
      terms: "財政調整基金は急な支出などに備える貯金、減債基金は借金返済のための貯金、特定目的基金は施設整備など目的を決めた貯金です。",
      example: "基金が合計500億円、収入規模が1,000億円なら、500 ÷ 1,000 × 100 ＝ 50%。",
      high: "高いほど、災害・税収減・大きな事業などに備える余力が厚い傾向があります。",
      low: "低いほど、急な支出が起きたときの選択肢が限られやすくなります。",
      caution: "これは本ツールの比較用指標で、法律上の健全化指標ではありません。基金には使い道が決まったものもあるため、全額を自由に使えるわけではありません。",
    },
    {
      number: "06",
      name: "経常収支比率の内訳",
      question: "固定費が多いのは、人件費・福祉・借金返済のどれが主な理由？",
      simple: "経常収支比率を費目別に分け、財政が動かしにくくなっている理由を探します。総合点だけでなく「なぜ高いのか」を説明するための数字です。",
      formulaTop: "各費目に毎年使った一般財源",
      formulaBottom: "毎年入る、使い道が決まっていない一般財源",
      suffix: "× 100",
      terms: "人件費は職員給与など、扶助費は生活・福祉の支援、公債費は借金返済です。このほか物件費や補助費などもあります。",
      example: "自由に使える収入が100億円で、人件費に25億円なら人件費分は25%。扶助費30%、公債費20%などと分けて主因を探します。",
      high: "ある費目が類似団体より高ければ、その費目が硬直化の主因である可能性があります。",
      low: "低い費目だけを見て安心せず、ほかの費目やサービス内容も合わせて確認します。",
      caution: "費用が高いことには理由があります。高齢化、施設数、行政区域の広さなど、地域事情を確認せずに良し悪しを決めないことが重要です。",
    },
  ];

  const glossary = [
    ["一般財源", "使い道が細かく決められておらず、自治体が比較的自由に使えるお金。地方税や地方交付税など。"],
    ["標準財政規模", "その自治体が標準的な状態で持つ、毎年の一般財源のおおよその大きさ。自治体の規模をそろえて比べる物差し。"],
    ["基金", "自治体の貯金。急な支出への備え、借金返済、施設整備など、目的によっていくつかの種類がある。"],
    ["地方債", "道路や学校など長く使う施設を整備するときなどに、自治体が行う借金。将来の住民も返済を負担する。"],
    ["普通会計", "自治体ごとに異なる会計を比べやすくするため、共通ルールで組み直した統計上の会計区分。"],
    ["類似団体", "人口や産業構造などが近い自治体のグループ。条件の近いまち同士で公平に比べるために使う。"],
  ];

  return <section className="page guide-page">
    <PageIntro eyebrow="FISCAL BASICS" title="やさしい指標解説" text="はじめて財政を見る人のために、計算方法と数字の意味を、身近な例で説明します。" />

    <div className="guide-hero">
      <div><span className="guide-kicker">まず、ここだけ覚えよう</span><h2>市町村の財政は、<br />「まちの大きな家計簿」です。</h2><p>市町村は、税金や国からのお金を受け取り、学校、道路、ごみ収集、消防、福祉などに使います。ただし、普通の家計と違い、利益を出すことが目的ではありません。住民に必要なサービスを続けながら、急な災害や将来の負担にも備える必要があります。</p></div>
      <div className="household-map"><div><span>まちの収入</span><b>税金・地方交付税など</b><small>家計なら「給料」に近い</small></div><i>→</i><div><span>まちの支出</span><b>教育・福祉・道路など</b><small>家計なら「生活費」に近い</small></div><i>＋</i><div><span>将来への備え</span><b>基金・借金の管理</b><small>家計なら「貯金とローン」</small></div></div>
    </div>

    <div className="guide-warning"><span>大切</span><p><b>1つの数字だけで「良いまち・悪いまち」と決めないでください。</b>人口、産業、年齢構成、面積、必要な公共施設などで数字は変わります。「似た自治体との比較」「数年間の変化」「高くなった理由」の3つを合わせて読みます。</p></div>

    <div className="reading-guide"><span className="eyebrow">HOW TO READ</span><h2>数字を見る4つの順番</h2><div><article><b>1</b><h3>同じ条件で比べる</h3><p>まず類似団体平均との差を見ます。人口の違う大都市と小さな町を、そのまま比べないためです。</p></article><article><b>2</b><h3>数年の流れを見る</h3><p>1年だけの上昇・低下に慌てず、3年・5年と続く変化かを確認します。</p></article><article><b>3</b><h3>複数の数字を組み合わせる</h3><p>借金が多くても基金が厚い場合があります。負担・余力・貯金をセットで見ます。</p></article><article><b>4</b><h3>理由を調べる</h3><p>高齢化、災害復旧、施設整備など、数字が動いた背景を決算資料で確認します。</p></article></div></div>

    <div className="guide-section-head"><span className="eyebrow">SIX KEY METRICS</span><h2>6つの数字を、ひとつずつ理解する</h2><p>計算式は理解しやすい形に簡略化しています。実際の公式計算では、法令に基づく控除や調整が加わる場合があります。</p></div>

    <div className="guide-metrics">{guideMetrics.map((item) => <article className="guide-metric-card" key={item.number}>
      <header><span>{item.number}</span><div><small>この数字でわかること</small><h3>{item.name}</h3></div></header>
      <p className="guide-question">「{item.question}」</p>
      <p className="guide-simple">{item.simple}</p>
      <div className="formula-box"><span className="formula-label">計算方法</span><div className="fraction"><b>{item.formulaTop}</b><i /><b>{item.formulaBottom}</b></div><strong>{item.suffix}</strong></div>
      <p className="term-note"><b>ことばの補足</b>{item.terms}</p>
      <div className="example-box"><span>たとえば</span><p>{item.example}</p></div>
      <div className="direction-grid"><div><span className="up">高いとき</span><p>{item.high}</p></div><div><span className="down">低いとき</span><p>{item.low}</p></div></div>
      <div className="guide-caution"><b>読み間違いに注意</b><p>{item.caution}</p></div>
    </article>)}</div>

    <div className="glossary"><div className="guide-section-head"><span className="eyebrow">GLOSSARY</span><h2>よく出てくる財政用語</h2><p>難しい言葉は、画面に戻る前にここで確認できます。</p></div><div className="glossary-grid">{glossary.map(([term, text]) => <article key={term}><h3>{term}</h3><p>{text}</p></article>)}</div></div>

    <div className="guide-finish"><div><span>迷ったときの合言葉</span><h2>比べる・流れを見る・理由を探す</h2></div><p>財政指標は、自治体を採点するためではなく、詳しく調べる入口を見つけるための道具です。</p></div>
  </section>;
}

function Sources() {
  const sourceRows = [
    ["地方財政状況調査（決算統計）", "e-Stat／総務省", "主要指標・内訳", "年1回"],
    ["健全化判断比率", "総務省", "実質公債費・将来負担", "年1回"],
    ["類似団体別市町村財政指数表", "総務省", "類似団体区分", "年1回"],
    ["住民基本台帳人口", "e-Stat", "人口・点サイズ", "年1回"],
  ];
  return <section className="page sources-page">
    <PageIntro eyebrow="METHODOLOGY & SOURCES" title="出典・注意" text="数字の出どころ、加工方法、そしてこのツールで言えることの限界を明らかにします。" />
    <div className="demo-banner"><span>!</span><div><b>現在はUI検証用のデモデータです</b><p>画面内の数値は操作性の検証を目的としたサンプルであり、公式値として引用できません。実データ接続後に取得日・原表・加工履歴を確定します。</p></div></div>
    <div className="source-grid"><div className="panel source-main"><span className="eyebrow">DATA LINEAGE</span><h2>データソース</h2><div className="source-table">{sourceRows.map((row) => <div key={row[0]}><div><b>{row[0]}</b><small>{row[1]}</small></div><span>{row[2]}</span><em>{row[3]}</em></div>)}</div></div><div className="panel update-card"><span className="eyebrow">LAST UPDATED</span><b>UI prototype</b><h2>2026.07.21</h2><p>データ取得日：未接続<br />対象：デモ40団体</p><div className="update-status"><i />実データ接続前</div></div></div>
    <div className="definitions"><span className="eyebrow">DEFINITIONS</span><h2>指標の定義と見方</h2><div className="definition-grid"><article><span>01</span><h3>財政力指数</h3><p>基準財政収入額 ÷ 基準財政需要額の3か年平均。高いほど自主財源による行政需要への対応力が高い傾向です。</p></article><article><span>02</span><h3>経常収支比率</h3><p>経常経費充当一般財源 ÷ 経常一般財源。高いほど使途の自由な財源に余裕が少ないことを示します。</p></article><article><span>03</span><h3>実質公債費比率</h3><p>公債費等 ÷ 標準財政規模の3か年平均。18%で起債許可団体、25%で早期健全化基準です。</p></article><article><span>04</span><h3>将来負担比率</h3><p>将来負担額 ÷ 標準財政規模。市町村の早期健全化基準は350%です。</p></article><article><span>05</span><h3>基金残高比率</h3><p>主要3基金の残高 ÷ 標準財政規模。本ツール独自の比較指標で、低いほど備えが薄い傾向です。</p></article></div></div>
    <div className="limits-grid"><article className="can"><span>言えること</span><h3>比較の起点をつくる</h3><ul><li>同じ区分・年度で見た相対的な位置</li><li>複数指標から見た財政構造の特徴</li><li>追加確認が必要な団体の一次選定</li></ul></article><article className="cannot"><span>言えないこと</span><h3>運営の巧拙は断定しない</h3><ul><li>単一指標による財政運営の良し悪し</li><li>公営企業・特別会計を含む全体像</li><li>将来の財政状況の予測・保証</li></ul></article></div>
    <div className="process"><span className="eyebrow">PROCESS</span><h2>加工フロー</h2><div><span><b>01</b>公表データ取得</span><i>→</i><span><b>02</b>コード・年度整形</span><i>→</i><span><b>03</b>欠損・異常値検証</span><i>→</i><span><b>04</b>類似団体集計</span><i>→</i><span><b>05</b>表示用JSON</span></div></div>
  </section>;
}
