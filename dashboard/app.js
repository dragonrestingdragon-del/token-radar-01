// Token Launch Radar dashboard (model radar-2). Reads window.RADAR, written beside dashboard/ by
// main.ts, and renders the ranked board, filters, a per-protocol detail view with the model's own
// arithmetic and the farm plan from board.json, plus the live-token set kept apart. No network.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var M = DATA.model;
  var state = { q: '', category: 'all', chain: 'all', min: 0, watch: false, tab: 'pre', sort: 'implied', selected: null, showAll: false };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + Number(n).toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + ' yrs';
    return Math.max(0, Math.round(days)) + ' days';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // The model, recomputed in the page from the row's own figures: the detail view shows this number
  // beside board.json's, so a reader can see the page and the board run the same arithmetic.
  function impliedOf(r) {
    var g = Math.min(M.growth_cap, Math.max(M.growth_floor, r.change_7d === null || r.change_7d === undefined ? 0 : r.change_7d));
    var gm = 1 + (g / 100) * M.growth_weight;
    var mm = r.age_days === null || r.age_days === undefined ? M.unknown_maturity
      : M.maturity_floor + (Math.min(Math.max(r.age_days, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
    var bm = 1 + M.breadth_per_chain * Math.min(Math.max(r.chains.length - 1, 0), M.breadth_max_chains);
    return { value: Math.max(1, Math.round(r.tvl_usd * r.peer_multiple * gm * mm * bm)), gm: gm, mm: mm, bm: bm };
  }

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('min')) state.min = Number(p.get('min')) || 0;
    if (p.get('watch') === '1') state.watch = true;
    if (p.get('tab')) state.tab = p.get('tab');
    if (p.get('sort')) state.sort = p.get('sort');
    if (p.get('p')) state.selected = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.min) p.set('min', String(state.min));
    if (state.watch) p.set('watch', '1');
    if (state.tab !== 'pre') p.set('tab', state.tab);
    if (state.selected) p.set('p', state.selected);
    history.replaceState(null, '', '#' + p.toString());
  }

  function uniq(list) { return Array.from(new Set(list)).sort(); }
  function categories() { return uniq(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; })); }
  function chains() { var s = []; DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { s.push(c); }); }); return uniq(s); }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.min && r.tvl_usd < state.min) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = {
      implied: function (r) { return r.implied_value_usd; },
      tvl: function (r) { return r.tvl_usd; },
      growth: function (r) { return r.change_7d === null ? -1e9 : r.change_7d; },
      age: function (r) { return r.age_days === null ? -1 : r.age_days; },
      confidence: function (r) { return r.confidence; }
    }[state.sort] || function (r) { return r.implied_value_usd; };
    return rows.sort(function (a, b) { return key(b) - key(a) || a.rank - b.rank; });
  }

  function headerHtml() {
    var totalTvl = DATA.rows.reduce(function (s, r) { return s + r.tvl_usd; }, 0);
    var totalImplied = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var top = DATA.rows[0];
    return '<div class="hero"><div>' +
      '<p class="kicker">Token Launch Radar &middot; model ' + esc(DATA.model_version) + '</p>' +
      '<h1>Protocols whose token does not exist yet, ranked by what it could be worth.</h1>' +
      '<p class="sub">Every protocol in the snapshot with no token, scored from the snapshot&rsquo;s own figures: ' +
      'the market value of a TVL dollar in its category, its seven-day growth, and how long it has run with no token. ' +
      'Snapshot as of ' + esc(DATA.as_of) + ' (DefiLlama). Implied values are this board&rsquo;s claim, not a prediction that a token will launch.</p></div>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + DATA.board_size + '</b><span>ranked</span></div>' +
      '<div class="stat"><b>' + DATA.watchlist_size + '</b><span>watchlist</span></div>' +
      '<div class="stat"><b>' + fmtUsd(totalTvl) + '</b><span>TVL covered</span></div>' +
      '<div class="stat"><b>' + fmtUsd(totalImplied) + '</b><span>implied total</span></div>' +
      '<div class="stat"><b>' + esc(top ? top.name : '') + '</b><span>rank #1</span></div>' +
      '</div></div>';
  }

  function modelHtml() {
    return '<section class="model"><h2>How the ranking works</h2>' +
      '<p>The anchor is not a flat guess: for each category, the model takes the median market-cap-to-TVL ratio of the ' +
      'protocols in the snapshot whose token already trades, so a lending market is priced like lending markets and a DEX like DEXes. ' +
      'That base is then adjusted for seven-day TVL growth (damped, so one hot week cannot make a valuation), for maturity ' +
      '(longer running with no token earns more), and slightly for chain breadth. Each row also carries a confidence score: ' +
      'how much of its record the snapshot actually shows.</p>' +
      '<div class="formula">implied = TVL &times; peer multiple (category median mcap/TVL) &times; growth &times; maturity &times; breadth</div>' +
      '<div class="chips">' +
      '<span class="chip">growth weight <b>' + M.growth_weight + '</b></span>' +
      '<span class="chip">growth clamp <b>' + M.growth_floor + '%..+' + M.growth_cap + '%</b></span>' +
      '<span class="chip">maturity <b>' + M.maturity_floor + '..' + (M.maturity_floor + M.maturity_range).toFixed(2) + ' over ' + M.maturity_days + 'd</b></span>' +
      '<span class="chip">peer clamp <b>' + M.peer_floor + '..' + M.peer_cap + '</b></span>' +
      '<span class="chip">breadth <b>+' + Math.round(M.breadth_per_chain * 100) + '%/chain, max ' + M.breadth_max_chains + '</b></span>' +
      '<span class="chip">early rows below the $50M floor <b>' + DATA.early_size + '</b></span>' +
      '<span class="chip">live tokens set aside <b>' + DATA.live_size + '</b></span>' +
      '</div></section>';
  }

  function controlsHtml() {
    var catOpts = ['all'].concat(categories()).map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + (c === 'all' ? 'All categories' : esc(c)) + '</option>';
    }).join('');
    var chainOpts = ['all'].concat(chains()).map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + (c === 'all' ? 'All chains' : esc(c)) + '</option>';
    }).join('');
    var mins = [[0, 'Any TVL'], [1e7, 'TVL $10M+'], [5e7, 'TVL $50M+'], [2.5e8, 'TVL $250M+'], [1e9, 'TVL $1B+']].map(function (m) {
      return '<option value="' + m[0] + '"' + (state.min === m[0] ? ' selected' : '') + '>' + m[1] + '</option>';
    }).join('');
    var sorts = [['implied', 'Sort: implied value'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7d growth'], ['age', 'Sort: age'], ['confidence', 'Sort: confidence']].map(function (s) {
      return '<option value="' + s[0] + '"' + (state.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
    }).join('');
    return '<div class="controls">' +
      '<input type="search" id="q" placeholder="Search name or slug" value="' + esc(state.q) + '" aria-label="Search">' +
      '<select id="category" aria-label="Category">' + catOpts + '</select>' +
      '<select id="chain" aria-label="Chain">' + chainOpts + '</select>' +
      '<select id="min" aria-label="Minimum TVL">' + mins + '</select>' +
      '<select id="sort" aria-label="Sort">' + sorts + '</select>' +
      '<label class="toggle"><input type="checkbox" id="watch"' + (state.watch ? ' checked' : '') + '> Watchlist only</label>' +
      '<div class="tabs" role="tablist">' +
      '<button class="tab" id="tab-pre" role="tab" aria-selected="' + (state.tab === 'pre') + '">Pre-token board</button>' +
      '<button class="tab" id="tab-live" role="tab" aria-selected="' + (state.tab === 'live') + '">Live tokens</button>' +
      '</div></div>';
  }

  function confHtml(r) {
    var pct = Math.round(r.confidence * 100);
    return '<div class="conf"><div class="confbar"><i style="width:' + pct + '%"></i></div>' + pct + '%</div>';
  }

  function boardHtml(rows) {
    var shown = state.showAll ? rows : rows.slice(0, 50);
    var body = shown.map(function (r) {
      var chg = r.change_7d === null ? '<span class="flat">n/a</span>'
        : '<span class="' + (r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : 'flat') + '">' + fmtPct(r.change_7d) + '</span>';
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td>' + r.rank + '</td>' +
        '<td class="l"><span class="pname">' + esc(r.name) + '</span>' + (r.watchlist ? '<span class="wl">WATCHLIST</span>' : '<span class="early">EARLY</span>') + '<br><span class="pslug">' + esc(r.slug) + '</span></td>' +
        '<td class="l cat">' + esc(r.category || 'Uncategorised') + '</td>' +
        '<td class="l chains">' + esc(r.chains.join(', ') || 'n/a') + '</td>' +
        '<td>' + fmtUsd(r.tvl_usd) + '</td><td>' + chg + '</td>' +
        '<td>' + fmtAge(r.age_days) + '</td>' +
        '<td>' + r.peer_multiple.toFixed(3) + '&times;</td>' +
        '<td class="implied">' + fmtUsd(r.implied_value_usd) + '</td>' +
        '<td>' + confHtml(r) + '</td></tr>';
    }).join('');
    var more = rows.length > shown.length ? '<div class="more"><button id="more">Show all ' + rows.length + ' protocols</button></div>' : '';
    return '<p class="count">' + rows.length + ' of ' + DATA.board_size + ' protocols shown</p>' +
      '<div class="tablewrap"><table><thead><tr><th>#</th><th class="l">Protocol</th><th class="l">Category</th><th class="l">Chains</th>' +
      '<th>TVL</th><th>7d</th><th>Age</th><th>Peer &times;</th><th>Implied value</th><th>Confidence</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>' + more;
  }

  function liveHtml() {
    var body = DATA.live.map(function (r) {
      var chg = r.change_7d === null ? '<span class="flat">n/a</span>'
        : '<span class="' + (r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : 'flat') + '">' + fmtPct(r.change_7d) + '</span>';
      return '<tr><td class="l"><span class="pname">' + esc(r.name) + '</span><br><span class="pslug">' + esc(r.slug) + '</span></td>' +
        '<td class="l cat">' + esc(r.category || 'Uncategorised') + '</td>' +
        '<td class="l chains">' + esc(r.chains.join(', ') || 'n/a') + '</td>' +
        '<td>' + fmtUsd(r.tvl_usd) + '</td><td>' + fmtUsd(r.mcap_usd) + '</td><td>' + chg + '</td></tr>';
    }).join('');
    return '<p class="count">These protocols already have a token, so the board shows the market&rsquo;s own value and never ranks them against the pre-token board. ' +
      'Their category medians are the peer multiples the model prices with.</p>' +
      '<div class="tablewrap"><table><thead><tr><th class="l">Protocol</th><th class="l">Category</th><th class="l">Chains</th><th>TVL</th><th>Market cap</th><th>7d</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  function detailHtml(r) {
    var chk = impliedOf(r);
    var steps = r.farm_steps.map(function (s) {
      var at = s.indexOf(' Cost: ');
      var text = at >= 0 ? s.slice(0, at) : s;
      var cost = at >= 0 ? s.slice(at + 1) : '';
      return '<li>' + esc(text) + (cost ? '<span class="cost">' + esc(cost) + '</span>' : '') + '</li>';
    }).join('');
    function kv(k, v) { return '<div class="kv"><span>' + k + '</span><b>' + v + '</b></div>'; }
    return '<section class="detail" id="detail"><button class="close" id="close">Close</button>' +
      '<h2>' + esc(r.name) + ' <span class="pslug">' + esc(r.slug) + '</span></h2>' +
      '<p class="meta">Rank #' + r.rank + ' of ' + DATA.board_size + ' &middot; ' + esc(r.category || 'Uncategorised') + ' &middot; ' +
      esc(r.chains.join(', ') || 'chain not recorded') + ' &middot; ' + (r.watchlist ? 'on the $50M watchlist' : 'early row, below the $50M floor') + '</p>' +
      '<div class="verdict">Implied value <b>' + fmtUsd(r.implied_value_usd) + '</b> at confidence <b>' + Math.round(r.confidence * 100) + '%</b>. ' +
      'That is what a token would be worth if this protocol&rsquo;s record stayed as it is; the farm plan below is how a reader positions for it.</div>' +
      '<div class="detailgrid"><div><h3>The record</h3>' +
      kv('TVL', fmtUsd(r.tvl_usd)) + kv('TVL change, 7 days', fmtPct(r.change_7d)) +
      kv('Tracked since', r.listed_at || 'not recorded') + kv('Age with no token', fmtAge(r.age_days)) +
      kv('Chains', String(r.chains.length)) + kv('Token today', 'none recorded') +
      '</div><div><h3>The model, step by step</h3>' +
      kv('Peer multiple (' + (r.peer_scope === 'category' ? 'category median' : 'global median, few category peers') + ')', r.peer_multiple.toFixed(4) + '&times; from ' + r.peer_count + ' live peers') +
      kv('Base = TVL &times; peer', fmtUsd(Math.round(r.tvl_usd * r.peer_multiple))) +
      kv('Growth multiplier', chk.gm.toFixed(4) + '&times;') +
      kv('Maturity multiplier', chk.mm.toFixed(4) + '&times;') +
      kv('Breadth multiplier', chk.bm.toFixed(4) + '&times;') +
      kv('Implied (this page recomputes)', fmtUsd(chk.value)) +
      kv('Implied (board.json)', fmtUsd(r.implied_value_usd)) +
      '</div><div><h3>Farm plan</h3><ol class="steps">' + steps + '</ol></div></div></section>';
  }

  function render() {
    var rows = filtered();
    var html = headerHtml() + modelHtml() + controlsHtml();
    html += state.tab === 'live' ? liveHtml() : boardHtml(rows);
    var sel = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0];
    if (sel && state.tab === 'pre') html += detailHtml(sel);
    html += '<footer>Built from the sealed DefiLlama snapshot of ' + esc(DATA.as_of) + ' only: no live prices, no outside data. ' +
      'Implied value is a model&rsquo;s claim about a token that does not exist; it is not financial advice and not a promise of an airdrop.</footer>';
    app.innerHTML = html;
    app.setAttribute('aria-busy', 'false');
    bind(rows);
    writeHash();
  }

  function bind(rows) {
    var q = document.getElementById('q');
    q.addEventListener('input', function () { state.q = q.value; state.showAll = false; render(); var nq = document.getElementById('q'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); });
    document.getElementById('category').addEventListener('change', function (e) { state.category = e.target.value; render(); });
    document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
    document.getElementById('min').addEventListener('change', function (e) { state.min = Number(e.target.value) || 0; render(); });
    document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
    document.getElementById('watch').addEventListener('change', function (e) { state.watch = e.target.checked; render(); });
    document.getElementById('tab-pre').addEventListener('click', function () { state.tab = 'pre'; render(); });
    document.getElementById('tab-live').addEventListener('click', function () { state.tab = 'live'; render(); });
    var more = document.getElementById('more');
    if (more) more.addEventListener('click', function () { state.showAll = true; render(); });
    Array.prototype.forEach.call(app.querySelectorAll('tbody tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function () {
        state.selected = tr.getAttribute('data-slug');
        render();
        var d = document.getElementById('detail');
        if (d) d.scrollIntoView({ block: 'start' });
      });
    });
    var close = document.getElementById('close');
    if (close) close.addEventListener('click', function () { state.selected = null; render(); });
  }

  readHash();
  render();
})();
