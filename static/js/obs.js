/* 럭키위시 OBS 오버레이: /obs/feed 를 주기적으로 조회해 결제 알림·시크릿 축하·결제 목록·채팅 로그를 그린다 */
(function () {
  'use strict';
  var C = window.OBS || {};
  var after = -1;
  var config = { duration: 6, sound: true };
  var queue = [];
  var showing = false;
  var build = '';
  var failCount = 0;
  var preview = document.body.classList.contains('is-preview');
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var won = function (n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; };
  var at = function (nick) { nick = String(nick || ''); return nick.charAt(0) === '@' ? nick : '@' + nick; };

  // ===== 소리: 파일 없이 WebAudio =====
  var audio = null;
  function ctx() {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }
  function tone(a, freq, start, len, type, vol) {
    var o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + len);
    o.connect(g).connect(a.destination);
    o.start(start); o.stop(start + len + 0.05);
  }
  // 결제: 맑은 차임 두 음
  function chime() {
    if (!config.sound) return;
    try {
      var a = ctx(), t = a.currentTime + 0.02;
      tone(a, 1174.66, t, 0.5, 'sine', 0.28);
      tone(a, 1567.98, t + 0.11, 0.7, 'sine', 0.26);
      tone(a, 2349.32, t + 0.11, 0.5, 'sine', 0.05);
    } catch (e) { /* 오디오를 못 쓰는 환경 */ }
  }
  // 시크릿: 반짝이는 상승 아르페지오 + 마지막 화음
  function sparkleSound() {
    if (!config.sound) return;
    try {
      var a = ctx(), t = a.currentTime + 0.02;
      [1046.5, 1318.51, 1567.98, 2093, 2637.02].forEach(function (f, i) { tone(a, f, t + i * 0.07, 0.35, 'triangle', 0.16); });
      [1046.5, 1318.51, 1567.98, 2093].forEach(function (f) { tone(a, f, t + 0.42, 1.2, 'sine', 0.12); });
      [3135.96, 2637.02, 3520, 2793.83].forEach(function (f, i) { tone(a, f, t + 0.6 + i * 0.12, 0.18, 'sine', 0.05); });
    } catch (e) { /* 오디오를 못 쓰는 환경 */ }
  }

  // ===== 시크릿 축하 사운드 (2026-11-07 사용자 요청 "축하음·축하 브금") — 직접 만든 멜로디, 파일 없음 =====
  function noise(a, start, len, vol, hp) {
    var n = Math.floor(a.sampleRate * len), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'highpass'; f.frequency.value = hp || 6000;
    g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.0001, start + len);
    src.connect(f).connect(g).connect(a.destination); src.start(start); src.stop(start + len + 0.02);
  }
  // 축하음: 빰빠밤~ 팡파레 + 반짝이
  function fanfare() {
    if (!config.sound) return;
    try {
      var a = ctx(), t = a.currentTime + 0.02;
      tone(a, 65.41, t, 0.8, 'sine', 0.45);
      [[523.25, 0, .14], [523.25, .16, .14], [523.25, .32, .14], [698.46, .5, .9]].forEach(function (n) {
        tone(a, n[0], t + n[1], n[2] + .2, 'sawtooth', 0.07); tone(a, n[0] * 2, t + n[1], n[2] + .2, 'triangle', 0.1);
      });
      [698.46, 880, 1046.5, 1396.91].forEach(function (f) { tone(a, f, t + .5, 1.4, 'triangle', 0.07); });
      for (var i = 0; i < 12; i++) tone(a, 2200 + Math.random() * 2200, t + .6 + i * 0.09, 0.14, 'sine', 0.045);
    } catch (e) {}
  }
  // 축하 브금: 약 10초 경쾌한 루프(BPM 150) — 멜로디·베이스·화음·박수(노이즈)·하이햇, 끝은 페이드
  function celebrateBgm(sec) {
    if (!config.sound) return;
    try {
      var a = ctx(), t0 = a.currentTime + 1.3, b = 60 / 150, bars = Math.max(1, Math.round(sec / (b * 4)));
      var N = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, C6: 1046.5 };
      var mel = [ // [음, 시작 박, 길이 박] — 2마디 반복
        ['E5', 0, .5], ['G5', .5, .5], ['C6', 1, 1], ['G5', 2, .5], ['A5', 2.5, .5], ['G5', 3, 1],
        ['F5', 4, .5], ['A5', 4.5, .5], ['G5', 5, .5], ['E5', 5.5, .5], ['D5', 6, .5], ['E5', 6.5, .5], ['C5', 7, 1]];
      var chords = [['C4', 'E4', 'G4'], ['A4', 'C5', 'E5'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']];
      var bass = [130.81, 110, 87.31, 98];
      for (var bar = 0; bar < bars; bar++) {
        var bt = t0 + bar * 4 * b, fade = bar === bars - 1 ? 0.5 : 1;
        if (bar % 2 === 0) mel.forEach(function (m) { tone(a, N[m[0]], bt + m[1] * b, m[2] * b * 0.95, 'square', 0.035 * fade); tone(a, N[m[0]], bt + m[1] * b, m[2] * b, 'triangle', 0.09 * fade); });
        var ch = chords[bar % 4], bs = bass[bar % 4];
        for (var k = 0; k < 4; k++) {
          var at = bt + k * b;
          tone(a, bs, at, b * 0.8, 'triangle', 0.16 * fade);
          ch.forEach(function (n) { tone(a, N[n], at + b * 0.5, b * 0.35, 'sine', 0.035 * fade); });
          noise(a, at + b * 0.5, 0.05, 0.05 * fade, 7000);
          if (k % 2 === 1) noise(a, at, 0.12, 0.12 * fade, 1500);
          if (k % 2 === 0) tone(a, 60, at, 0.18, 'sine', 0.32 * fade);
        }
      }
    } catch (e) {}
  }
  // 시크릿: 10초 동안 특수효과 10종 전부를 평소보다 촘촘히 뿌린다 (관리자 토글과 따로)
  var partyTimers = [];
  function party(ms) {
    partyTimers.forEach(clearInterval); partyTimers = [];
    Object.keys(FX).forEach(function (k) {
      for (var i = 0; i < 3; i++) FX[k][1]();
      partyTimers.push(setInterval(FX[k][1], Math.max(90, FX[k][0] / 3)));
    });
    document.body.classList.add('party');
    setTimeout(function () { partyTimers.forEach(clearInterval); partyTimers = []; document.body.classList.remove('party'); }, ms);
  }

  // 대폭발 효과음: 쿵 + 상승 스윕 + 반짝이 (2026-11-05 개발자 전용 '메가 축하')
  function megaSound() {
    if (!config.sound) return;
    try {
      var a = ctx(), t = a.currentTime + 0.02;
      tone(a, 70, t, 0.9, 'sine', 0.5); tone(a, 110, t, 0.5, 'triangle', 0.3);
      [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093].forEach(function (f, i) { tone(a, f, t + 0.12 + i * 0.06, 0.5, 'triangle', 0.13); });
      [1046.5, 1318.51, 1567.98, 2093, 2637.02].forEach(function (f) { tone(a, f, t + 0.6, 1.8, 'sine', 0.09); });
      for (var i = 0; i < 10; i++) tone(a, 2400 + Math.random() * 1800, t + 0.9 + i * 0.18, 0.15, 'sine', 0.05);
    } catch (e) { /* 오디오를 못 쓰는 환경 */ }
  }
  // 화면 전체가 4초 동안 터지는 연출: 섬광 → 회전 빛줄기 → 충격파 3겹 → 큰 글자 → 불꽃놀이 7번 → 색종이
  function mega(stage, ev) {
    var host = document.createElement('div');
    host.className = 'mega';
    host.innerHTML = '<i class="mega-flash"></i><i class="mega-rays"></i><i class="mega-ring r1"></i><i class="mega-ring r2"></i><i class="mega-ring r3"></i>' +
      '<div class="mega-text">' + (C.logo ? '<img class="mega-logo" src="' + esc(C.logo) + '" alt="">' : '') + '<b>' + esc(ev.summary || '럭키위시 대박!!') + '</b><i class="mega-hearts">♥ ♥ ♥</i></div>';
    var colors = ['#f4a6b4', '#ff8fb0', '#fffaf2', '#f7ede0', '#ffffff', '#ec93a5', '#ffe7a3'];
    for (var i = 0; i < 140; i++) {
      var c = document.createElement('i');
      c.className = 'mega-confetti' + (i % 3 === 0 ? ' heart' : (i % 3 === 1 ? ' round' : ''));
      var ang = Math.random() * Math.PI * 2, dist = 300 + Math.random() * 700;
      c.style.setProperty('--dx', Math.round(Math.cos(ang) * dist) + 'px');
      c.style.setProperty('--dy', Math.round(Math.sin(ang) * dist * 0.8 - 200) + 'px');
      c.style.setProperty('--fall', Math.round(500 + Math.random() * 700) + 'px');
      c.style.setProperty('--rot', Math.round(360 + Math.random() * 1080) + 'deg');
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = Math.round(Math.random() * 220) + 'ms';
      host.appendChild(c);
    }
    function firework(x, y, delay, color) {
      setTimeout(function () {
        var fw = document.createElement('div');
        fw.className = 'mega-fw'; fw.style.left = x + '%'; fw.style.top = y + '%';
        for (var k = 0; k < 28; k++) {
          var sp = document.createElement('i');
          var a2 = (k / 28) * Math.PI * 2;
          sp.style.setProperty('--dx', Math.round(Math.cos(a2) * 230) + 'px');
          sp.style.setProperty('--dy', Math.round(Math.sin(a2) * 230) + 'px');
          sp.style.background = color; sp.style.boxShadow = '0 0 12px ' + color;
          fw.appendChild(sp);
        }
        host.appendChild(fw);
        setTimeout(function () { fw.remove(); }, 1400);
      }, delay);
    }
    firework(22, 26, 350, '#ffe7a3'); firework(78, 22, 700, '#ff8fb0'); firework(30, 62, 1150, '#fffaf2');
    firework(72, 58, 1500, '#f4a6b4'); firework(50, 18, 1900, '#ffffff'); firework(18, 44, 2300, '#ec93a5'); firework(84, 40, 2600, '#ffe7a3');
    stage.appendChild(host);
    burst(host, 40, 620); burst(host, 30, 760);
    setTimeout(function () { burst(host, 30, 560); }, 800);
    setTimeout(function () { burst(host, 24, 480); }, 1700);
    document.body.classList.add('mega-shake');
    setTimeout(function () { document.body.classList.remove('mega-shake'); }, 700);
    megaSound();
    return host;
  }


  // ===== 뽑기 (2026-11-05): 캡슐 머신 → 손잡이 돌림 → 캡슐 툭 → 열리면서 상품 공개 =====
  function gacha(stage, ev) {
    var rar = ev.rarity || 0, tier = ['당첨', '레어', '전설'][rar];
    var nick = ev.nickname ? at(ev.nickname) : '';
    var host = document.createElement('div');
    host.className = 'gacha r' + rar;
    var balls = '';
    var cols = ['#f4a6b4', '#fffaf2', '#ffd36b', '#ec93a5', '#bfe3ff', '#ffe6ec', '#c9f0d2'];
    var spots = [[6, 66], [26, 70], [46, 68], [66, 70], [82, 62], [14, 46], [34, 50], [54, 48], [74, 44], [24, 28], [44, 30], [62, 26], [36, 10], [8, 82]];
    for (var i = 0; i < spots.length; i++) balls += '<i style="--c:' + cols[i % cols.length] + ';--x:' + spots[i][0] + '%;--y:' + spots[i][1] + '%;--d:' + (i * 70) + 'ms"></i>';
    host.innerHTML =
      '<div class="gacha-rays"></div>' +
      '<div class="gacha-machine"><div class="gacha-dome">' + balls + '</div><div class="gacha-body"><span class="gacha-brand">LUCKYWISH</span><i class="gacha-knob"></i><i class="gacha-chute"></i></div></div>' +
      '<div class="gacha-cap"><i class="cap-top"></i><i class="cap-bot"></i></div>' +
      '<div class="gacha-card"><span class="gacha-tier">' + (ev.slot ? ev.slot + '번 · ' : '') + tier + '!</span><b class="gacha-name">' + esc(ev.summary || '') + '</b>' +
        /* 2026-11-19 사용자 요청: 당첨 카드에서 닉네임 줄(@구매 고객 님) 제거 */
        '<span class="gacha-left">남은 뽑기 ' + (ev.count || 0) + '개</span></div>';
    stage.appendChild(host);
    try { chime(); } catch (e) {}
    setTimeout(function () {
      burst(host.querySelector('.gacha-card'), rar === 2 ? 46 : (rar === 1 ? 32 : 20), rar === 2 ? 640 : 480);
      if (rar === 2) { setTimeout(function () { burst(host.querySelector('.gacha-card'), 36, 560); }, 600); try { megaSound(); } catch (e) {} }
      else { try { sparkleSound(); } catch (e) {} }
    }, 3100);
    return host;
  }

  // ===== 결제 알림 · 시크릿 축하 (화면 아래쪽, 유튜브 채팅창 바로 위) =====
  function titleHtml(ev) {
    var t = esc(ev.title), nick = esc(ev.nickname);
    return nick ? t.split(nick).join('<b>' + nick + '</b>') : t;
  }
  function finish(el, ms, done) {
    setTimeout(function () {
      el.classList.add('leave');
      setTimeout(function () {
        el.remove(); showing = false;
        if (done) try { done(); } catch (e) {}
        // 남은 알림이 없으면 '대기 중' 표시로 돌아간다 (2026-11-05 사용자 요청)
        if (!queue.length) { var st = document.querySelector('[data-stage]'); if (st) st.classList.remove('busy'); }
        setTimeout(showNext, 250);
      }, 450);
    }, ms);
  }
  function burst(host, count, spread) {
    var shapes = ['heart', 'spark', 'dot'];
    for (var i = 0; i < count; i++) {
      var p = document.createElement('i');
      var ang = Math.random() * Math.PI * 2, dist = spread * (0.45 + Math.random() * 0.75);
      p.className = 'pop pop-' + shapes[i % 3]; // 2026-11-05 특수효과(.fx-*)와 이름이 겹쳐 pop-* 로 분리
      p.style.left = (35 + Math.random() * 30) + '%';
      p.style.top = (35 + Math.random() * 30) + '%';
      p.style.setProperty('--dx', Math.round(Math.cos(ang) * dist) + 'px');
      p.style.setProperty('--dy', Math.round(Math.sin(ang) * dist * 0.55 - 40) + 'px');
      p.style.setProperty('--s', (0.6 + Math.random() * 0.9).toFixed(2));
      p.style.animationDelay = Math.round(Math.random() * 260) + 'ms';
      host.appendChild(p);
    }
  }
  // ===== 뽑기 번호판 (2026-11-06): 관리자에서 '뽑기 시작'을 누르면 1~N 번이 뜨고, 고른 번호가 열린다 =====
  var gbData = null, gbServer = null, gbPending = {}, gbPicked = 0, gbKey = '';
  // 서버 값. 한 번 뽑으면 서버에서 번호판이 닫히지만, 고른 칸 반짝임·기계 연출이 끝날 때까지는 마지막 판을 남겨 둔다 (2026-11-06 "한번 하고나면 닫혀야해")
  function renderBoard(b, force) {
    gbServer = b || null;
    drawBoard(b || (Object.keys(gbPending).length || gbPicked ? gbData : null), force);
  }
  function drawBoard(b, force) {
    gbData = b || null;
    var box = document.querySelector('.gboard');
    if (!b) { if (box) box.hidden = true; gbKey = ''; return; }
    var key = JSON.stringify(b) + '|' + Object.keys(gbPending).join(',') + '|' + gbPicked;
    if (box && !force && key === gbKey) return;
    gbKey = key;
    if (!box) { box = document.createElement('section'); box.className = 'gboard'; document.body.appendChild(box); }
    box.hidden = false;
    var cols = Math.max(6, Math.min(13, Math.ceil(Math.sqrt(b.total * 2.4))));
    var left = b.left, cells = '';
    b.slots.forEach(function (s) {
      var no = s[0], open = s.length > 1 && !gbPending[no];
      if (s.length > 1 && gbPending[no]) left++;
      cells += open
        ? '<i class="gb-cell is-open" data-no="' + no + '"><b>' + no + '</b><small>' + esc(s[1]) + '</small></i>'
        : '<i class="gb-cell' + (gbPicked === no ? ' is-picked' : '') + '" data-no="' + no + '"><b>' + no + '</b></i>';
    });
    box.style.setProperty('--cols', cols);
    box.innerHTML = '<header class="gb-head"><strong>번호 뽑기</strong><span>남은 ' + left + ' / ' + b.total + '</span></header><div class="gb-grid">' + cells + '</div>';
  }
  function showNext() {
    if (showing || !queue.length) return;
    showing = true;
    var ev = queue.shift();
    var stage = document.querySelector('[data-stage]');
    stage.classList.add('busy');
    if (ev.type === 'mega') {
      finish(mega(stage, ev), 4200);
      return;
    }
    if (ev.type === 'gacha') {
      var after2 = function () { delete gbPending[ev.slot]; gbPicked = 0; document.body.classList.remove('gb-hide'); renderBoard(gbServer, true); };
      var run = function () { finish(gacha(stage, ev), (ev.rarity === 2 ? 8200 : 7200), after2); };
      var cell = ev.slot && document.querySelector('.gboard:not([hidden]) [data-no="' + ev.slot + '"]');
      if (cell) {
        // 번호판에서 고른 칸이 반짝 → 번호판이 내려가고 → 기계 연출 (2026-11-06 사용자 요청)
        gbPicked = ev.slot; drawBoard(gbData, true);
        try { chime(); } catch (e) {}
        setTimeout(function () { document.body.classList.add('gb-hide'); setTimeout(run, 380); }, 1700);
      } else run();
      return;
    }
    if (ev.type === 'secret') {
      var nick = ev.nickname && ev.nickname !== '구매 고객' ? ev.nickname : '';
      var box = document.createElement('div');
      box.className = 'secret';
      box.innerHTML = '<span class="secret-glow"></span><div class="secret-card"><p class="secret-word">SECRET</p>' +
        (ev.summary ? '<p class="secret-name">' + esc(ev.summary) + '</p>' : '') +
        '<p class="secret-who">' + (nick ? '<b>' + esc(at(nick)) + '</b> 님 축하해요!' : '시크릿 등장! 축하해요!') + '</p></div>';
      stage.appendChild(box);
      // 2026-11-07 사용자 요청: 특수효과 10종 10초 + 축하음 + 축하 브금
      var PARTY_MS = 10000;
      party(PARTY_MS);
      burst(box, 40, 560);
      for (var bi = 1; bi < 7; bi++) setTimeout(function () { burst(box, 22, 480); }, bi * 1400);
      fanfare(); sparkleSound();
      celebrateBgm((PARTY_MS - 1300) / 1000);
      finish(box, Math.max(PARTY_MS, config.duration * 1000));
      return;
    }
    // 몰릴 때는 한 건을 짧게 보여 줘서 밀리지 않게 한다
    var seconds = queue.length >= 2 ? Math.min(config.duration, 3.5) : config.duration;
    var el = document.createElement('div');
    el.className = 'alert' + (ev.first ? ' is-first' : '');
    el.innerHTML =
      '<img class="alert-logo" src="' + esc(C.logo) + '" alt="">' +
      '<div class="alert-body">' +
        '<span class="alert-kicker' + (ev.type === 'ordered' ? ' ordered' : '') + '">' + (ev.type === 'ordered' ? '주문 접수' : '결제 완료') + '</span>' +
        (ev.first ? '<span class="alert-first">첫 주문</span>' : '') +
        '<div class="alert-title">' + titleHtml(ev) + '</div>' +
        (ev.summary ? '<div class="alert-item">' + esc(ev.summary) + (ev.amount != null ? '<em>' + won(ev.amount) + '</em>' : '') + '</div>' : '') +
      '</div>' +
      '<div class="alert-progress"><i style="animation-duration:' + seconds + 's"></i></div>';
    burst(el, 8, 260);
    stage.appendChild(el);
    chime();
    finish(el, seconds * 1000);
  }

  // 상품 줄마다 <span class="ln"> (줄 사이 띄움, 2026-11-05)
  function lines(text) { return String(text).split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return '<span class="ln">' + esc(l) + '</span>'; }).join(''); }
  // ===== 오른쪽 위: 결제 목록 + 채팅 로그 =====
  var seenBuyer = null, seenChat = null, chatPerson = null;
  var sample = {
    list: [
      { id: -3, nickname: '모찌러버', summary: '라부부 랜덤박스 ×2', now: true },
      { id: -2, nickname: '말랑콩떡', summary: '크라이베이비 피규어 ×1' },
      { id: -1, nickname: '뽑기요정', summary: '스키니도그 블라인드 ×3' }
    ],
    orders: 12, items: 27, live: true, chatOn: true, chatFor: '모찌러버',
    chat: [
      { id: -3, author: '@모찌러버', message: '시크릿 제발 나와라~~' },
      { id: -2, author: '@모찌러버', message: '언박싱 너무 귀여워요 🩷' },
      { id: -1, author: '@모찌러버', message: '두근두근 ✨' }
    ]
  };
  function renderSide(st) {
    st = st || {};
    if (preview && !(st.list || []).length && !(st.chat || []).length) st = sample;
    var stat = document.querySelector('[data-side-stat]');
    if (stat) stat.textContent = (st.waiting > 0 ? '대기 ' + st.waiting + '명 · ' : '') + (st.live ? '이번 방송 ' : '오늘 ') + (st.orders || 0) + '건';
    var list = document.querySelector('[data-buyer-list]');
    var rows = st.list || [];
    var first = seenBuyer === null, seen = {};
    list.innerHTML = rows.length ? rows.map(function (r, i) {
      seen[r.id] = true;
      var fresh = !first && !seenBuyer[r.id];
      return '<li class="' + (r.now ? 'is-now' : '') + (fresh ? ' fresh' : '') + '"><span class="buyer-no">' + (r.now ? '지금' : i + 1) + '</span><span class="buyer-nick">' + esc(at(r.nickname)) + (r.first ? '<i class="buyer-first">첫 주문</i>' : '') + '</span><span class="buyer-item">' + lines(r.summary || '결제 완료') + '</span></li>';
    }).join('') : '<li class="side-empty">결제를 기다리는 중이에요</li>';
    if (rows.length && st.more > 0) list.insertAdjacentHTML('beforeend', '<li class="buyer-more">외 ' + st.more + '명 대기</li>');
    seenBuyer = seen;

    // 채팅 로그: 지금 개봉 중인 사람 것만. 사람이 바뀌면 통째로 바뀌고, 남은 사람이 없으면 비워져 칸이 사라진다.
    var chatBox = document.querySelector('[data-side-chat]');
    var chat = st.chat || [];
    var chatFor = st.chatFor || '';
    chatBox.hidden = !st.chatOn || !chatFor;
    var head = document.querySelector('[data-chat-head]');
    if (head) head.textContent = chatFor ? at(chatFor) : '채팅';
    if (chatFor !== chatPerson) { seenChat = null; chatPerson = chatFor; }
    var chatList = document.querySelector('[data-chat-list]');
    var firstChat = seenChat === null, seenNow = {};
    chatList.innerHTML = chat.length ? chat.map(function (m) {
      seenNow[m.id] = true;
      var fresh = !firstChat && !seenChat[m.id];
      return '<li class="' + (fresh ? 'fresh' : '') + '"><span class="chat-msg">' + esc(m.message) + '</span></li>';
    }).join('') : '<li class="side-empty">아직 채팅이 없어요</li>';
    seenChat = seenNow;
  }

  // ===== 채팅 추첨 (오른쪽 위 칸 → 발표 때는 아래쪽 가운데) =====
  var clockOffset = 0, drawSeen = null, drawRolling = false, drawFirst = true, drawState = null, drawDone = null;
  function fmtLeft(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60); }
  function setText(sel, text) { var el = document.querySelector(sel); if (el) el.textContent = text; }
  function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  // 발표가 끝나면 7초 뒤 칸을 내린다
  function drawFinish(box, key) {
    setTimeout(function () {
      if (drawSeen !== key) return; // 그 사이 새 추첨이 시작됐으면 그대로 둔다
      drawDone = key;
      box.hidden = true;
      drawPlace(box, false);
    }, 7000);
  }
  // 모집 중엔 오른쪽 기둥 안, 발표 때는 body 바로 아래(아래쪽 가운데 고정). 기둥은 transform 이 걸려 있어 그 안에서는 fixed 가 안 먹는다
  function drawPlace(box, center) {
    box.classList.toggle('draw-center', center);
    var home = document.querySelector('.side');
    if (center && box.parentNode !== document.body) document.body.appendChild(box);
    else if (!center && home && box.parentNode !== home) home.appendChild(box);
  }
  function tickDraw() {
    var d = drawState, t = document.querySelector('[data-draw-time]');
    if (d && t && d.phase !== 'drawn') {
      var left = d.endsAt - (Date.now() + clockOffset) / 1000;
      t.textContent = left > 0 ? fmtLeft(left) : '마감!';
      t.classList.toggle('urgent', left > 0 && left <= 10);
      document.querySelector('[data-draw]').classList.toggle('closed', left <= 0);
      setText('[data-draw-phase]', left > 0 ? '참여 모집' : '마감');
    }
  }
  if (C.mode === 'side') setInterval(tickDraw, 250);
  // 룰렛 칸이 넘어갈 때 ‘틱’ 소리
  function tickClick() {
    if (!config.sound) return;
    try {
      var a = ctx(), t0 = a.currentTime, o = a.createOscillator(), g = a.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(1800, t0);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
      o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + 0.05);
    } catch (e) { /* 소리 실패는 무시 */ }
  }
  // 룰렛: 슬롯머신처럼 이름 띠가 위로 흐르다 등감속으로 느려지고 당첨자 칸에서 살짝 튕기며 멈춘다. 5초.
  function rollTo(reel, pool, winner, done) {
    var others = pool.filter(function (n) { return n !== winner; });
    if (!others.length) others = pool.length ? pool.slice() : [winner];
    var lineH = Math.round(parseFloat(getComputedStyle(reel).fontSize) * 1.4);
    var items = [], count = 48, shift = Math.floor(Math.random() * others.length);
    for (var k = 0; k < count; k++) items.push(others[(k + shift) % others.length]);
    items.push(winner);
    var strip = document.createElement('div');
    strip.className = 'draw-strip';
    items.forEach(function (n) { var it = document.createElement('i'); it.textContent = n; strip.appendChild(it); });
    reel.textContent = '';
    reel.style.setProperty('--lh', lineH + 'px');
    reel.style.setProperty('height', lineH + 'px', 'important');
    reel.style.setProperty('line-height', lineH + 'px', 'important');
    reel.classList.add('rolling');
    reel.appendChild(strip);
    var N = items.length - 1, D = N * lineH, T = 5000;
    strip.style.transform = 'translateY(0)';
    strip.style.filter = 'blur(2.5px)';
    for (var line = 1; line <= N; line++) {
      var tk = T * (1 - Math.sqrt(1 - line / N));
      var lps = (2 * N / T) * (1 - tk / T) * 1000;
      if (lps < 14) setTimeout(tickClick, tk);
    }
    void strip.offsetHeight;
    strip.style.transition = 'transform ' + T + 'ms cubic-bezier(.25, .46, .45, .94), filter 900ms ease-out ' + Math.round(T * .25) + 'ms';
    strip.style.transform = 'translateY(' + (-D) + 'px)';
    strip.style.filter = 'blur(0)';
    setTimeout(function () {
      strip.style.transition = 'transform 150ms ease-out';
      strip.style.transform = 'translateY(' + (-(D + lineH * 0.25)) + 'px)';
      setTimeout(function () {
        strip.style.transition = 'transform 400ms cubic-bezier(.2, 1.8, .4, 1)';
        strip.style.transform = 'translateY(' + (-D) + 'px)';
      }, 160);
      setTimeout(function () {
        reel.classList.remove('rolling');
        reel.style.removeProperty('height');
        reel.style.removeProperty('line-height');
        reel.textContent = winner;
        replay(reel, 'land');
        done();
      }, 600);
    }, T);
  }
  function renderDraw(d) {
    var box = document.querySelector('[data-draw]');
    if (!box) return;
    // 2026-11-05: 참여 모집은 결제 목록 소스(오른쪽 기둥), 당첨 발표는 결제 알림 소스(화면 가운데)에서만 그린다.
    // 두 소스가 따로 움직이므로 결제 목록 소스를 옮겨도 발표 위치는 그대로다.
    if (d && ((C.mode === 'side' && d.phase === 'drawn') || (C.mode === 'alert' && d.phase !== 'drawn'))) d = null;
    drawState = d || null;
    if (d && d.serverTime) clockOffset = d.serverTime * 1000 - Date.now();
    // 발표가 끝나 이미 내린 추첨이면 다시 띄우지 않는다
    if (d && drawDone === d.id + '|' + d.drawSeq) { box.hidden = true; return; }
    box.hidden = !d;
    if (!d) { drawSeen = null; drawFirst = false; drawDone = null; drawPlace(box, false); return; }
    drawPlace(box, d.phase === 'drawn');
    var openEl = document.querySelector('[data-draw-open]'), rollEl = document.querySelector('[data-draw-roll]');
    setText('[data-draw-prize]', d.prize);
    setText('[data-draw-prize2]', d.prize);
    setText('[data-draw-keyword]', d.keyword);
    setText('[data-draw-count]', '참여 ' + d.count + '명' + (d.members ? ' · 멤버 ' + d.members + '명' : ''));
    if (d.phase !== 'drawn') {
      openEl.hidden = false; rollEl.hidden = true; drawSeen = null; drawFirst = false;
      tickDraw();
      return;
    }
    setText('[data-draw-phase]', '당첨 발표');
    var key = d.id + '|' + d.drawSeq;
    if (drawRolling || drawSeen === key) return;
    var list = document.querySelector('[data-draw-winners]'), reel = document.querySelector('[data-draw-reel]');
    openEl.hidden = true; rollEl.hidden = false;
    var sameDraw = drawSeen && drawSeen.split('|')[0] === String(d.id);
    var already = sameDraw ? list.children.length : 0;
    drawSeen = key;
    if (drawFirst) {
      // 오버레이를 추첨이 끝난 뒤에 켰으면 결과만 보여 준다
      drawFirst = false;
      list.innerHTML = d.winners.map(function (w, i) { return '<li><b>' + (i + 1) + '등</b>' + esc(w) + '</li>'; }).join('');
      reel.textContent = d.winners[d.winners.length - 1] || '';
      drawFinish(box, key);
      return;
    }
    if (!already) list.innerHTML = '';
    drawRolling = true;
    var i = already;
    (function next() {
      if (i >= d.winners.length) { drawRolling = false; drawFinish(box, key); return; }
      rollTo(reel, d.pool, d.winners[i], function () {
        var li = document.createElement('li');
        li.innerHTML = '<b>' + (i + 1) + '등</b>' + esc(d.winners[i]);
        list.appendChild(li);
        sparkleSound();
        burst(box, 34, 560);
        setTimeout(function () { burst(box, 20, 460); }, 700);
        i++;
        setTimeout(next, 1400);
      });
    })();
  }

  // ===== 조회 =====
  // ===== 특수효과 (2026-11-05 사용자 요청): 관리자에서 켠 효과를 결제 알림 소스 전체 화면에 잔잔하게 띄운다 =====
  var fxLayer = null, fxTimers = {};
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  function fxSpawn(cls, text, vars, life) {
    if (!fxLayer) { fxLayer = document.createElement('div'); fxLayer.className = 'fx-layer'; document.body.insertBefore(fxLayer, document.body.firstChild); }
    var el = document.createElement('i');
    el.className = 'fx ' + cls;
    if (text) el.textContent = text;
    Object.keys(vars).forEach(function (k) { el.style.setProperty('--' + k, vars[k]); });
    fxLayer.appendChild(el);
    setTimeout(function () { el.remove(); }, life);
    if (fxLayer.children.length > (partyTimers.length ? 320 : 160)) fxLayer.firstChild.remove();
  }
  var FX = {
    hearts: [700, function () { var d = rnd(7, 11); fxSpawn('fx-heart', '♥', { x: rnd(2, 98) + '%', d: d + 's', s: rnd(.8, 1.9).toFixed(2), dx: rnd(-90, 90) + 'px', c: pick(['#f4a6b4', '#ff8fb0', '#ffc6d3', '#e07a90']) }, d * 1000); }],
    stars: [600, function () { var d = rnd(8, 13); fxSpawn('fx-star', '★', { x: rnd(2, 98) + '%', d: d + 's', s: rnd(.6, 1.6).toFixed(2), dx: rnd(-60, 60) + 'px', r: rnd(-180, 180) + 'deg' }, d * 1000); }],
    sparkle: [220, function () { var d = rnd(1.2, 2.2); fxSpawn('fx-sparkle', '✦', { x: rnd(2, 98) + '%', y: rnd(4, 92) + '%', d: d + 's', s: rnd(.5, 1.6).toFixed(2), c: pick(['#fff', '#f7ede0', '#ffd1dc', '#ffe08a']) }, d * 1000); }],
    bubbles: [900, function () { var d = rnd(9, 15); fxSpawn('fx-bubble', '', { x: rnd(2, 98) + '%', d: d + 's', s: rnd(.5, 1.8).toFixed(2), dx: rnd(-120, 120) + 'px' }, d * 1000); }],
    petals: [550, function () { var d = rnd(8, 13); fxSpawn('fx-petal', '❀', { x: rnd(-5, 100) + '%', d: d + 's', s: rnd(.7, 1.6).toFixed(2), dx: rnd(-160, 160) + 'px', r: rnd(360, 1080) + 'deg', c: pick(['#ffb7c5', '#ff9fb5', '#ffd3dc', '#f4a6b4']) }, d * 1000); }],
    snow: [260, function () { var d = rnd(9, 16); fxSpawn('fx-snow', '', { x: rnd(-3, 103) + '%', d: d + 's', s: rnd(.4, 1.4).toFixed(2), dx: rnd(-90, 90) + 'px' }, d * 1000); }],
    confetti: [320, function () { var d = rnd(6, 10); fxSpawn('fx-confetti', '', { x: rnd(-3, 103) + '%', d: d + 's', s: rnd(.6, 1.4).toFixed(2), dx: rnd(-120, 120) + 'px', r: rnd(360, 1440) + 'deg', c: pick(['#f4a6b4', '#f7ede0', '#141011', '#ffffff', '#ffd1dc', '#e07a90']) }, d * 1000); }],
    fireflies: [500, function () { var d = rnd(6, 10); fxSpawn('fx-firefly', '', { x: rnd(2, 98) + '%', y: rnd(8, 90) + '%', d: d + 's', s: rnd(.5, 1.3).toFixed(2), dx: rnd(-140, 140) + 'px', dy: rnd(-120, 120) + 'px' }, d * 1000); }],
    shooting: [2600, function () { var d = rnd(1, 1.6); fxSpawn('fx-shoot', '', { x: rnd(30, 110) + '%', y: rnd(2, 45) + '%', d: d + 's', s: rnd(.7, 1.4).toFixed(2) }, d * 1000); }],
    emoji: [1100, function () { var d = rnd(7, 11); fxSpawn('fx-emoji', pick(['😻', '🎁', '💖', '🌟', '🍀', '🥰', '🎀', '✨']), { x: rnd(4, 96) + '%', d: d + 's', s: rnd(.7, 1.5).toFixed(2), dx: rnd(-80, 80) + 'px' }, d * 1000); }]
  };
  function applyFx(list) {
    Object.keys(FX).forEach(function (k) {
      var want = list.indexOf(k) >= 0;
      if (want && !fxTimers[k]) { FX[k][1](); fxTimers[k] = setInterval(FX[k][1], FX[k][0]); }
      if (!want && fxTimers[k]) { clearInterval(fxTimers[k]); delete fxTimers[k]; }
    });
    document.body.classList.toggle('has-fx', list.length > 0);
  }

  function poll() {
    var url = '/obs/feed?key=' + encodeURIComponent(C.key) + '&after=' + after + (C.mode === 'side' ? '&side=1' : '&draw=1') + (C.mute ? '&mute=1' : '');
    fetch(url, { cache: 'no-store', credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.message || 'feed');
      failCount = 0;
      config = j.config || config;
      if (C.mute) config.sound = false;
      if (C.mode === 'alert') { applyFx(config.fx || []); renderDraw(j.draw); }
      if (C.mode === 'side') { renderSide(j.side); renderDraw(j.draw); }
      else {
        if (after >= 0 || C.mute) (j.events || []).forEach(function (ev) { if (ev.type === 'gacha' && ev.slot) gbPending[ev.slot] = 1; queue.push(ev); });
        renderBoard(j.gboard);
        showNext();
      }
      after = j.last;
      // 새 버전이 배포되면 화면에 알림·뽑기·추첨이 없는 순간에 스스로 새로고침한다 (OBS 에서 직접 새로고침할 필요 없음)
      if (j.build) {
        if (!build) build = j.build;
        else if (j.build !== build && !showing && !queue.length && !j.draw && !preview) { location.reload(); return; }
      }
    }).catch(function () {
      failCount++;
    }).then(function () {
      // 서버가 응답하지 않으면 조회 간격을 늘렸다가 복구되면 원래대로
      setTimeout(poll, failCount ? Math.min(15000, C.poll * (1 + failCount)) : C.poll);
    });
  }

  if (preview) {
    var bar = document.createElement('div');
    bar.className = 'preview-bar';
    bar.innerHTML = '<span>미리보기 화면입니다. 체크무늬는 OBS에서 투명하게 보입니다.</span>';
    if (C.mode === 'alert') {
      var add = function (label, ev) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = label;
        b.addEventListener('click', function () { queue.push(ev); showNext(); });
        bar.insertBefore(b, bar.lastChild);
      };
      add('결제 알림 보기', { type: 'paid', nickname: '모찌러버', title: '모찌러버님 결제 완료!', summary: '라부부 랜덤박스 ×2', amount: null });
      add('첫 주문 알림 보기', { type: 'paid', first: true, nickname: '모찌러버', title: '모찌러버님 결제 완료!', summary: '라부부 랜덤박스 ×2', amount: null });
      add('시크릿 축하 보기', { type: 'secret', nickname: '모찌러버', summary: '라부부 시크릿' });
    }
    document.body.appendChild(bar);
  }
  // OBS 소스 크기 점검 (2026-11-05): 브라우저 소스를 기본값 800×600 으로 넣으면 배치가 틀어진다.
  // OBS 안에서만(window.obsstudio) 세로 1080×1920·가로 1920×1080 비율이 아니면 경고를 띄운다.
  function checkSize() {
    if (!window.obsstudio) return;
    var w = window.innerWidth, h = window.innerHeight, r = w / h;
    var ok = (r > 0.52 && r < 0.6) || (r > 1.7 && r < 1.85);
    var box = document.getElementById('obs-size-warn');
    if (ok) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'obs-size-warn';
      box.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;z-index:99;padding:14px 16px;border-radius:16px;background:#b3263e;color:#fff;font:800 18px/1.45 Pretendard,"Malgun Gothic",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4)';
      document.body.appendChild(box);
    }
    box.textContent = 'OBS 소스 크기가 ' + w + '×' + h + ' 입니다. 소스 속성에서 너비 1080, 높이 1920 으로 바꾸고, 오른쪽 클릭 → 변환 → 변환 초기화(Ctrl+R)를 눌러 주세요.';
  }
  checkSize();
  window.addEventListener('resize', checkSize);
  poll();
})();
