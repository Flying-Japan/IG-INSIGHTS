/* ── IG 인사이트 대시보드 ── */

// ── Utilities ──
const fmt = n => n == null ? '-' : n.toLocaleString('ko-KR');
const fmtPct = n => n == null ? '-' : n.toFixed(1) + '%';
const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const sum = arr => arr.reduce((a, b) => a + (b || 0), 0);
const chartColors = {
  accent: '#F77737', accent2: '#833AB4', blue: '#448aff',
  green: '#00c853', red: '#ff5252', yellow: '#ffd600',
  orange: '#ff9100', purple: '#7c4dff', pink: '#e91e63',
};
const typeLabel = t => ({ 'CAROUSEL_ALBUM': '캐러셀', 'VIDEO': '릴스', 'IMAGE': '이미지' }[t] || t);
const chartTheme = {
  chart: { background: 'transparent', foreColor: '#9499b3', fontFamily: 'Noto Sans KR, sans-serif' },
  grid: { borderColor: '#2e3247', strokeDashArray: 3 },
  tooltip: { theme: 'dark' },
};

// ── Data Store ──
let DATA = { posts: [], followers: [], daily: [], meta: {} };

// ── Init ──
async function init() {
  try {
    const [posts, followers, daily, meta] = await Promise.all([
      fetch('data/posts.json').then(r => r.json()),
      fetch('data/followers.json').then(r => r.json()),
      fetch('data/daily_report.json').then(r => r.json()),
      fetch('data/meta.json').then(r => r.json()),
    ]);
    DATA = { posts, followers, daily, meta };
    document.getElementById('update-time').textContent = '업데이트: ' + meta.updated_at_ko;
    document.getElementById('loading').classList.add('hidden');

    setupTabs();
    renderOverview();
    renderPostTable();
    renderFollowers();
    renderCategory();
    renderContent();
  } catch (e) {
    document.getElementById('loading').innerHTML = '<p>데이터 로딩 실패: ' + e.message + '</p>';
  }
}

// ── Tab Navigation ──
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      // Resize charts on tab switch
      window.dispatchEvent(new Event('resize'));
    });
  });
}

// ══════════════════════════════════════════════════
// TAB 1: Overview
// ══════════════════════════════════════════════════
function renderOverview() {
  const { posts, followers, daily } = DATA;

  // KPIs
  document.getElementById('kpi-posts').textContent = fmt(posts.length);

  const latestFollowers = followers.length ? followers[followers.length - 1].followers : null;
  document.getElementById('kpi-followers').textContent = fmt(latestFollowers);
  if (followers.length >= 2) {
    const change = (followers[followers.length - 1].followers || 0) - (followers[followers.length - 2].followers || 0);
    const el = document.getElementById('kpi-followers-change');
    el.textContent = (change >= 0 ? '+' : '') + fmt(change) + ' (전일 대비)';
    el.className = 'kpi-sub ' + (change >= 0 ? 'positive' : 'negative');
  }

  const engRates = posts.map(p => p.engagement_rate).filter(v => v != null);
  document.getElementById('kpi-engagement').textContent = fmtPct(avg(engRates));

  const reaches = posts.map(p => p.reach).filter(v => v != null);
  document.getElementById('kpi-reach').textContent = fmt(Math.round(avg(reaches)));

  const totalLikes = sum(posts.map(p => p.likes));
  document.getElementById('kpi-likes').textContent = fmt(totalLikes);

  const top = posts.find(p => p.rank === 1);
  document.getElementById('kpi-top').textContent = top ? top.title : '-';

  // Follower trend chart (last 30 days from daily report or follower data)
  if (followers.length > 0) {
    new ApexCharts(document.getElementById('chart-follower-trend'), {
      ...chartTheme,
      series: [{ name: '팔로워', data: followers.map(f => f.followers) }],
      chart: { ...chartTheme.chart, type: 'area', height: 250 },
      xaxis: { categories: followers.map(f => f.date.replace(/\(.\)$/, '')), labels: { style: { fontSize: '11px' } } },
      yaxis: { labels: { formatter: v => fmt(v) } },
      stroke: { curve: 'smooth', width: 2 },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05 } },
      colors: [chartColors.accent],
      grid: chartTheme.grid,
      tooltip: { ...chartTheme.tooltip, y: { formatter: v => fmt(v) + '명' } },
    }).render();
  }

  // Content type distribution donut
  const typeCounts = {};
  posts.forEach(p => { typeCounts[p.media_type] = (typeCounts[p.media_type] || 0) + 1; });
  new ApexCharts(document.getElementById('chart-type-dist'), {
    ...chartTheme,
    series: Object.values(typeCounts),
    chart: { ...chartTheme.chart, type: 'donut', height: 250 },
    labels: Object.keys(typeCounts).map(typeLabel),
    colors: [chartColors.accent, chartColors.blue, chartColors.green, chartColors.yellow],
    legend: { position: 'bottom', labels: { colors: '#9499b3' } },
    plotOptions: { pie: { donut: { size: '55%' } } },
  }).render();

  // Daily reach & engagement
  if (daily.length > 0) {
    new ApexCharts(document.getElementById('chart-daily-reach'), {
      ...chartTheme,
      series: [
        { name: '총 도달', data: daily.map(d => d.total_reach) },
        { name: '총 참여', data: daily.map(d => d.total_engagement) },
      ],
      chart: { ...chartTheme.chart, type: 'bar', height: 280 },
      xaxis: { categories: daily.map(d => d.date.replace(/\(.\)$/, '')), labels: { style: { fontSize: '11px' } } },
      yaxis: { labels: { formatter: v => fmt(v) } },
      colors: [chartColors.blue, chartColors.green],
      plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
      grid: chartTheme.grid,
      tooltip: { ...chartTheme.tooltip, y: { formatter: v => fmt(v) } },
    }).render();
  }
}

// ══════════════════════════════════════════════════
// TAB 2: Post Table
// ══════════════════════════════════════════════════
let postTable = null;
let currentSortField = 'rank';

// Column definitions factory
const colDef = {
  rank:       () => ({ title: '순위', field: '_rank', width: 60, hozAlign: 'center', sorter: 'number' }),
  upload_date:() => ({ title: '업로드일', field: 'upload_date', width: 110, sorter: 'string' }),
  media_type: () => ({ title: '유형', field: 'media_type', width: 80, hozAlign: 'center', formatter: cell => typeLabel(cell.getValue()) }),
  category:   () => ({ title: '카테고리', field: 'category', width: 90, hozAlign: 'center' }),
  title:      () => ({ title: '제목', field: 'title', minWidth: 180,
    formatter: cell => {
      const row = cell.getRow().getData();
      return row.url ? `<a href="${row.url}" target="_blank" style="color:#F77737;text-decoration:none">${cell.getValue()}</a>` : cell.getValue();
    }}),
  reach:      () => ({ title: '도달', field: 'reach', width: 80, hozAlign: 'right', sorter: 'number', formatter: cell => fmt(cell.getValue()) }),
  views:      () => ({ title: '조회수', field: 'views', width: 80, hozAlign: 'right', sorter: 'number', formatter: cell => fmt(cell.getValue()) }),
  likes:      () => ({ title: '좋아요', field: 'likes', width: 70, hozAlign: 'right', sorter: 'number', formatter: cell => fmt(cell.getValue()) }),
  saves:      () => ({ title: '저장', field: 'saves', width: 65, hozAlign: 'right', sorter: 'number', formatter: cell => fmt(cell.getValue()) }),
  shares:     () => ({ title: '공유', field: 'shares', width: 65, hozAlign: 'right', sorter: 'number', formatter: cell => fmt(cell.getValue()) }),
  comments:   () => ({ title: '댓글', field: 'comments', width: 60, hozAlign: 'right', sorter: 'number', formatter: cell => fmt(cell.getValue()) }),
  engagement_rate: () => ({ title: '참여율', field: 'engagement_rate', width: 75, hozAlign: 'right', sorter: 'number',
    formatter: cell => {
      const v = cell.getValue();
      if (v == null) return '-';
      const color = v >= 5 ? '#00c853' : v >= 3 ? '#ffd600' : '#9499b3';
      return `<span style="color:${color}">${v.toFixed(1)}%</span>`;
    }}),
  composite_score: () => ({ title: '점수', field: 'composite_score', width: 65, hozAlign: 'right', sorter: 'number',
    formatter: cell => { const v = cell.getValue(); return v != null ? v.toFixed(1) : '-'; }}),
};

// Default column order
const defaultOrder = ['rank','upload_date','media_type','category','title','reach','views','likes','saves','shares','comments','engagement_rate','composite_score'];

// Build columns with the sort-target field moved right after title
function buildColumns(sortField) {
  const order = [...defaultOrder];
  const metricsFields = ['reach','views','likes','saves','shares','comments','engagement_rate'];
  if (metricsFields.includes(sortField)) {
    const idx = order.indexOf(sortField);
    const titleIdx = order.indexOf('title');
    if (idx > titleIdx + 1) {
      order.splice(idx, 1);
      order.splice(titleIdx + 1, 0, sortField); // right after title
    }
  }
  return order.map(key => colDef[key]());
}

// Recalculate rank based on sort field
function recalcRankedData(posts, sortField, sortDir) {
  const sorted = [...posts];
  if (sortField === 'rank') {
    // Use original composite rank
    sorted.sort((a, b) => (a.rank || 999) - (b.rank || 999));
  } else if (sortField === 'upload_date') {
    sorted.sort((a, b) => sortDir === 'desc' ? b.upload_date.localeCompare(a.upload_date) : a.upload_date.localeCompare(b.upload_date));
  } else {
    sorted.sort((a, b) => sortDir === 'desc' ? (b[sortField] || 0) - (a[sortField] || 0) : (a[sortField] || 0) - (b[sortField] || 0));
  }
  return sorted.map((p, i) => ({ ...p, _rank: i + 1 }));
}

function renderPostTable() {
  const { posts } = DATA;

  // Populate category filter
  const categories = [...new Set(posts.map(p => p.category).filter(Boolean))].sort();
  const catSelect = document.getElementById('filter-category');
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    catSelect.appendChild(opt);
  });

  // Initial data with original rank
  const initialData = recalcRankedData(posts, 'rank', 'asc');

  postTable = new Tabulator('#post-table', {
    data: initialData,
    layout: 'fitColumns',
    height: '600px',
    pagination: false,
    columns: buildColumns('rank'),
  });

  // Sort dropdown handler
  document.getElementById('sort-select').addEventListener('change', function() {
    const [field, dir] = this.value.split('|');
    currentSortField = field;
    const rankedData = recalcRankedData(DATA.posts, field, dir);
    postTable.setColumns(buildColumns(field));
    postTable.replaceData(rankedData);
    // Re-apply active filters
    applyFilters();
  });

  // Filters
  document.getElementById('filter-category').addEventListener('change', applyFilters);
  document.getElementById('filter-type').addEventListener('change', applyFilters);
  document.getElementById('filter-search').addEventListener('input', applyFilters);
}

function applyFilters() {
  const cat = document.getElementById('filter-category').value;
  const type = document.getElementById('filter-type').value;
  const search = document.getElementById('filter-search').value.toLowerCase();

  const filters = [];
  if (cat) filters.push({ field: 'category', type: '=', value: cat });
  if (type) filters.push({ field: 'media_type', type: '=', value: type });
  if (search) filters.push({ field: 'title', type: 'like', value: search });

  postTable.setFilter(filters);
}

// ══════════════════════════════════════════════════
// TAB 3: Followers
// ══════════════════════════════════════════════════
function renderFollowers() {
  const { followers } = DATA;
  if (!followers.length) return;

  const latest = followers[followers.length - 1];
  const first = followers[0];
  const totalGrowth = (latest.followers || 0) - (first.followers || 0);
  const avgGrowth = followers.length > 1 ? totalGrowth / (followers.length - 1) : 0;

  document.getElementById('kpi-total-growth').textContent = (totalGrowth >= 0 ? '+' : '') + fmt(totalGrowth);
  document.getElementById('kpi-avg-growth').textContent = (avgGrowth >= 0 ? '+' : '') + avgGrowth.toFixed(1) + '/일';
  document.getElementById('kpi-current-followers').textContent = fmt(latest.followers);

  // Calculate daily changes
  const changes = followers.map((f, i) => {
    if (i === 0) return { date: f.date, change: 0 };
    const change = (f.followers || 0) - (followers[i - 1].followers || 0);
    return { date: f.date, change };
  });

  const best = changes.reduce((a, b) => (b.change > a.change ? b : a), changes[0]);
  document.getElementById('kpi-best-day').textContent = best.date + ' (+' + fmt(best.change) + ')';

  // Full follower chart
  new ApexCharts(document.getElementById('chart-follower-full'), {
    ...chartTheme,
    series: [{ name: '팔로워', data: followers.map(f => f.followers) }],
    chart: { ...chartTheme.chart, type: 'area', height: 300 },
    xaxis: { categories: followers.map(f => f.date.replace(/\(.\)$/, '')), labels: { style: { fontSize: '11px' } } },
    yaxis: { labels: { formatter: v => fmt(v) } },
    stroke: { curve: 'smooth', width: 2 },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05 } },
    colors: [chartColors.accent2],
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => fmt(v) + '명' } },
  }).render();

  // Daily change bar chart
  new ApexCharts(document.getElementById('chart-follower-change'), {
    ...chartTheme,
    series: [{ name: '변화', data: changes.slice(1).map(c => c.change) }],
    chart: { ...chartTheme.chart, type: 'bar', height: 250 },
    xaxis: { categories: changes.slice(1).map(c => c.date.replace(/\(.\)$/, '')), labels: { style: { fontSize: '11px' } } },
    colors: [chartColors.green],
    plotOptions: {
      bar: {
        borderRadius: 3,
        colors: {
          ranges: [{ from: -1000, to: -1, color: chartColors.red }, { from: 0, to: 10000, color: chartColors.green }],
        },
      },
    },
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => (v >= 0 ? '+' : '') + fmt(v) + '명' } },
  }).render();
}

// ══════════════════════════════════════════════════
// TAB 4: Category Analysis
// ══════════════════════════════════════════════════
function renderCategory() {
  const { posts } = DATA;
  const catMap = {};
  posts.forEach(p => {
    const c = p.category || '기타';
    if (!catMap[c]) catMap[c] = [];
    catMap[c].push(p);
  });

  const catStats = Object.entries(catMap).map(([cat, items]) => ({
    category: cat,
    count: items.length,
    avgEngagement: avg(items.map(p => p.engagement_rate).filter(v => v != null)),
    avgReach: avg(items.map(p => p.reach).filter(v => v != null)),
    avgSaves: avg(items.map(p => p.saves).filter(v => v != null)),
    avgShares: avg(items.map(p => p.shares).filter(v => v != null)),
    avgScore: avg(items.map(p => p.composite_score).filter(v => v != null)),
  })).sort((a, b) => b.avgEngagement - a.avgEngagement);

  // Insights
  const best = catStats[0];
  const bestReach = [...catStats].sort((a, b) => b.avgReach - a.avgReach)[0];
  const bestSave = [...catStats].sort((a, b) => b.avgSaves - a.avgSaves)[0];
  document.getElementById('category-insights').innerHTML =
    `<div class="insight-item">` +
    `<strong>${best.category}</strong> 카테고리의 평균 참여율이 ${best.avgEngagement.toFixed(1)}%로 가장 높습니다.<br>` +
    `<strong>${bestReach.category}</strong> 카테고리의 평균 도달이 ${fmt(Math.round(bestReach.avgReach))}으로 가장 넓습니다.<br>` +
    `<strong>${bestSave.category}</strong> 카테고리의 평균 저장수가 ${fmt(Math.round(bestSave.avgSaves))}으로 가장 높습니다.` +
    `</div>`;

  // Engagement bar chart
  new ApexCharts(document.getElementById('chart-cat-engagement'), {
    ...chartTheme,
    series: [{ name: '평균 참여율', data: catStats.map(c => +c.avgEngagement.toFixed(1)) }],
    chart: { ...chartTheme.chart, type: 'bar', height: 300 },
    xaxis: { categories: catStats.map(c => c.category), labels: { style: { fontSize: '12px' } } },
    yaxis: { labels: { formatter: v => v + '%' } },
    colors: [chartColors.accent],
    plotOptions: { bar: { borderRadius: 4, horizontal: true } },
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => v + '%' } },
  }).render();

  // Reach bar chart
  new ApexCharts(document.getElementById('chart-cat-reach'), {
    ...chartTheme,
    series: [{ name: '평균 도달', data: catStats.map(c => Math.round(c.avgReach)) }],
    chart: { ...chartTheme.chart, type: 'bar', height: 300 },
    xaxis: { categories: catStats.map(c => c.category), labels: { style: { fontSize: '12px' } } },
    yaxis: { labels: { formatter: v => fmt(v) } },
    colors: [chartColors.blue],
    plotOptions: { bar: { borderRadius: 4, horizontal: true } },
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => fmt(v) } },
  }).render();

  // Save/Share grouped bar
  new ApexCharts(document.getElementById('chart-cat-save-share'), {
    ...chartTheme,
    series: [
      { name: '평균 저장', data: catStats.map(c => Math.round(c.avgSaves)) },
      { name: '평균 공유', data: catStats.map(c => Math.round(c.avgShares)) },
    ],
    chart: { ...chartTheme.chart, type: 'bar', height: 300 },
    xaxis: { categories: catStats.map(c => c.category), labels: { style: { fontSize: '12px' } } },
    colors: [chartColors.green, chartColors.orange],
    plotOptions: { bar: { borderRadius: 3, columnWidth: '60%' } },
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => fmt(v) } },
  }).render();

  // Category summary table
  new Tabulator('#cat-summary-table', {
    data: catStats,
    layout: 'fitColumns',
    columns: [
      { title: '카테고리', field: 'category', width: 100 },
      { title: '게시물 수', field: 'count', width: 80, hozAlign: 'right', sorter: 'number' },
      { title: '평균 참여율', field: 'avgEngagement', width: 100, hozAlign: 'right', sorter: 'number',
        formatter: cell => cell.getValue().toFixed(1) + '%' },
      { title: '평균 도달', field: 'avgReach', width: 100, hozAlign: 'right', sorter: 'number',
        formatter: cell => fmt(Math.round(cell.getValue())) },
      { title: '평균 저장', field: 'avgSaves', width: 80, hozAlign: 'right', sorter: 'number',
        formatter: cell => fmt(Math.round(cell.getValue())) },
      { title: '평균 공유', field: 'avgShares', width: 80, hozAlign: 'right', sorter: 'number',
        formatter: cell => fmt(Math.round(cell.getValue())) },
      { title: '평균 종합점수', field: 'avgScore', width: 100, hozAlign: 'right', sorter: 'number',
        formatter: cell => cell.getValue().toFixed(1) },
    ],
  });
}

// ══════════════════════════════════════════════════
// TAB 5: Content Analysis
// ══════════════════════════════════════════════════
function renderContent() {
  const { posts } = DATA;
  const typeMap = {};
  posts.forEach(p => {
    const t = p.media_type || 'OTHER';
    if (!typeMap[t]) typeMap[t] = [];
    typeMap[t].push(p);
  });

  const typeStats = Object.entries(typeMap).map(([type, items]) => ({
    type,
    label: typeLabel(type),
    count: items.length,
    avgReach: avg(items.map(p => p.reach).filter(v => v != null)),
    avgEngagement: avg(items.map(p => p.engagement_rate).filter(v => v != null)),
    avgSaves: avg(items.map(p => p.saves).filter(v => v != null)),
    avgShares: avg(items.map(p => p.shares).filter(v => v != null)),
    avgSaveRate: avg(items.map(p => p.save_rate).filter(v => v != null)),
    avgShareRate: avg(items.map(p => p.share_rate).filter(v => v != null)),
  }));

  // Insights
  const bestReach = [...typeStats].sort((a, b) => b.avgReach - a.avgReach)[0];
  const bestSaveRate = [...typeStats].sort((a, b) => b.avgSaveRate - a.avgSaveRate)[0];
  const bestShareRate = [...typeStats].sort((a, b) => b.avgShareRate - a.avgShareRate)[0];

  let insightHtml = `<div class="insight-item">`;
  insightHtml += `<strong>${bestReach.label}</strong>의 평균 도달이 ${fmt(Math.round(bestReach.avgReach))}으로 가장 높습니다.<br>`;
  insightHtml += `<strong>${bestSaveRate.label}</strong>의 평균 저장율이 ${bestSaveRate.avgSaveRate.toFixed(1)}%로 가장 높습니다. (가치있는 콘텐츠 지표)<br>`;
  insightHtml += `<strong>${bestShareRate.label}</strong>의 평균 공유율이 ${bestShareRate.avgShareRate.toFixed(1)}%로 가장 높습니다. (바이럴 잠재력 지표)`;

  // Compare types
  if (typeStats.length >= 2) {
    const carousel = typeStats.find(t => t.type === 'CAROUSEL_ALBUM');
    const video = typeStats.find(t => t.type === 'VIDEO');
    if (carousel && video) {
      if (carousel.avgSaveRate > video.avgSaveRate) {
        const ratio = (carousel.avgSaveRate / video.avgSaveRate).toFixed(1);
        insightHtml += `<br><strong>캐러셀</strong>이 릴스보다 저장율이 ${ratio}배 높습니다.`;
      }
      if (video.avgReach > carousel.avgReach) {
        const ratio = (video.avgReach / carousel.avgReach).toFixed(1);
        insightHtml += `<br><strong>릴스</strong>가 캐러셀보다 도달이 ${ratio}배 넓습니다.`;
      }
    }
  }
  insightHtml += `</div>`;
  document.getElementById('content-insights').innerHTML = insightHtml;

  // Content type comparison grouped bar
  new ApexCharts(document.getElementById('chart-content-compare'), {
    ...chartTheme,
    series: [
      { name: '평균 도달', data: typeStats.map(t => Math.round(t.avgReach)) },
      { name: '평균 저장', data: typeStats.map(t => Math.round(t.avgSaves)) },
      { name: '평균 공유', data: typeStats.map(t => Math.round(t.avgShares)) },
    ],
    chart: { ...chartTheme.chart, type: 'bar', height: 300 },
    xaxis: { categories: typeStats.map(t => t.label) },
    colors: [chartColors.blue, chartColors.green, chartColors.orange],
    plotOptions: { bar: { borderRadius: 3, columnWidth: '55%' } },
    grid: chartTheme.grid,
    tooltip: { ...chartTheme.tooltip, y: { formatter: v => fmt(v) } },
  }).render();

  // Scatter: Reach vs Engagement Rate
  const scatterSeries = Object.entries(typeMap).map(([type, items]) => ({
    name: typeLabel(type),
    data: items.filter(p => p.reach && p.engagement_rate).map(p => ({
      x: p.reach,
      y: p.engagement_rate,
      title: p.title,
    })),
  }));
  new ApexCharts(document.getElementById('chart-scatter'), {
    ...chartTheme,
    series: scatterSeries,
    chart: { ...chartTheme.chart, type: 'scatter', height: 300 },
    xaxis: { title: { text: '도달', style: { color: '#9499b3' } }, labels: { formatter: v => fmt(v) } },
    yaxis: { title: { text: '참여율(%)', style: { color: '#9499b3' } }, labels: { formatter: v => v.toFixed(1) + '%' } },
    colors: [chartColors.accent, chartColors.blue, chartColors.green],
    grid: chartTheme.grid,
    tooltip: {
      ...chartTheme.tooltip,
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const p = w.config.series[seriesIndex].data[dataPointIndex];
        return `<div style="padding:8px;font-size:12px"><strong>${p.title || ''}</strong><br>도달: ${fmt(p.x)}<br>참여율: ${p.y.toFixed(1)}%</div>`;
      },
    },
  }).render();

  // Top 10 table
  const top10 = [...posts].sort((a, b) => (a.rank || 999) - (b.rank || 999)).slice(0, 10);
  new Tabulator('#top10-table', {
    data: top10,
    layout: 'fitColumns',
    columns: [
      { title: '순위', field: 'rank', width: 55, hozAlign: 'center', sorter: 'number' },
      { title: '유형', field: 'media_type', width: 70, hozAlign: 'center', formatter: cell => typeLabel(cell.getValue()) },
      { title: '카테고리', field: 'category', width: 80 },
      { title: '제목', field: 'title', minWidth: 200,
        formatter: cell => {
          const row = cell.getRow().getData();
          return row.url ? `<a href="${row.url}" target="_blank" style="color:#F77737;text-decoration:none">${cell.getValue()}</a>` : cell.getValue();
        }},
      { title: '도달', field: 'reach', width: 80, hozAlign: 'right', sorter: 'number', formatter: cell => fmt(cell.getValue()) },
      { title: '참여율', field: 'engagement_rate', width: 70, hozAlign: 'right', formatter: cell => fmtPct(cell.getValue()) },
      { title: '저장', field: 'saves', width: 60, hozAlign: 'right', formatter: cell => fmt(cell.getValue()) },
      { title: '공유', field: 'shares', width: 60, hozAlign: 'right', formatter: cell => fmt(cell.getValue()) },
      { title: '점수', field: 'composite_score', width: 60, hozAlign: 'right', formatter: cell => cell.getValue()?.toFixed(1) || '-' },
    ],
  });
}

// ── Start ──
document.addEventListener('DOMContentLoaded', init);
