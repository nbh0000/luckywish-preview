/* 럭키위시 라이브샵 공통 스크립트: 장바구니(브라우저 저장), 바텀시트, 방송 상태 폴링, 주소 찾기, 복사 */
(function () {
  'use strict';
  var GM = window.GM || {};
  var OPT = GM.opt || { opened: '라이브 개봉', unopened: '미개봉 발송', card: '카드 개봉' };
  if (!OPT.card) OPT.card = '카드 개봉';
  var KEY = 'gm_cart_v1';
  var footerVisible = false;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var won = function (n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var csrf = ($('meta[name="csrf"]') || {}).content || '';

  // ===== API =====
  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf, Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, message: '서버 응답을 읽을 수 없습니다' }; }).then(function (j) {
        if (r.status === 401 && j.login) {
          location.href = '/login?next=' + encodeURIComponent(location.pathname);
          throw new Error(j.message);
        }
        if (r.status === 400 && j.profile) {
          location.href = '/signup/profile';
          throw new Error(j.message);
        }
        if (!r.ok || j.ok === false) throw new Error(j.message || '요청을 처리하지 못했습니다');
        return j;
      });
    });
  }

  // ===== 토스트 =====
  var toastEl = null, toastTimer = null;
  function toast(msg, type) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.className = 'toast' + (type === 'error' ? ' error' : '');
    requestAnimationFrame(function () { toastEl.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }
  var flashEl = $('[data-flash]');
  if (flashEl) setTimeout(function () { flashEl.classList.remove('show'); }, 3200);

  // ===== 장바구니 저장소 =====
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function save(cart) {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) { /* 사파리 사생활 보호 모드 등 */ }
    renderBadge();
  }
  function lineQty(l) { return l.option ? (l.opened || 0) + (l.unopened || 0) + (l.card || 0) : (l.qty || 0); }
  function cartCount(cart) { return (cart || load()).reduce(function (s, l) { return s + lineQty(l); }, 0); }
  function cartTotal(cart) { return (cart || load()).reduce(function (s, l) { return s + (l.price || 0) * lineQty(l); }, 0); }
  function toLines(cart) {
    return (cart || load()).map(function (l) {
      return { productId: l.productId, packageType: l.packageType || 'standard', opened: l.opened || 0, unopened: l.unopened || 0, card: l.card || 0, qty: l.option ? 0 : (l.qty || 0), noBox: !!l.noBox };
    });
  }

  function renderBadge() {
    var n = cartCount();
    $$('[data-cart-count]').forEach(function (el) { el.textContent = n; el.hidden = n === 0; });
    var bar = $('[data-cartbar]');
    if (bar) {
      bar.classList.toggle('show', n > 0 && !footerVisible);
      var t = $('[data-cartbar-text]', bar);
      if (t) t.textContent = n + '개' + (GM.showPrice ? ' · ' + won(cartTotal()) : '');
    }
  }

  // ===== 바텀시트 =====
  function watchFooter() {
    var footer = $('.foot');
    if (!footer) return;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        footerVisible = !!(entries[0] && entries[0].isIntersecting);
        renderBadge();
      }, { rootMargin: '0px 0px 80px 0px', threshold: 0 }).observe(footer);
      return;
    }
    var check = function () {
      var rect = footer.getBoundingClientRect();
      footerVisible = rect.top < window.innerHeight + 80 && rect.bottom > 0;
      renderBadge();
    };
    window.addEventListener('scroll', check, { passive: true });
    check();
  }

  document.addEventListener('gm:cart-updated', renderBadge);
  watchFooter();
  var backdrop = $('[data-backdrop]');
  var openSheetEl = null;
  function openSheet(el) {
    if (openSheetEl && openSheetEl !== el) closeSheet();
    el.removeAttribute('hidden');
    el.hidden = false;
    openSheetEl = el;
    requestAnimationFrame(function () {
      el.classList.add('open');
      if (backdrop) backdrop.classList.add('open');
    });
    document.documentElement.style.overflow = 'hidden';
  }
  function closeSheet() {
    if (!openSheetEl) return;
    var el = openSheetEl;
    openSheetEl = null;
    el.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.documentElement.style.overflow = '';
    setTimeout(function () { if (!el.classList.contains('open')) { el.hidden = true; el.setAttribute('hidden', ''); } }, 320);
  }
  if (backdrop) backdrop.addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  $$('[data-close-sheet]').forEach(function (b) { b.addEventListener('click', closeSheet); });
  $$('[data-open-review-sheet]').forEach(function (button) {
    button.addEventListener('click', function () {
      var id = button.getAttribute('data-open-review-sheet');
      var sheet = id ? document.getElementById(id) : null;
      if (!sheet) return;
      openSheet(sheet);
      var rating = $('[name="rating"]', sheet);
      if (rating) setTimeout(function () { rating.focus(); }, 260);
    });
  });

  // 아래로 끌어서 닫기 (손잡이/헤더 영역)
  $$('.sheet').forEach(function (sheet) {
    var startY = null, dy = 0;
    var handle = function (e) { return e.target.closest('.sheet-grab, .sheet-head'); };
    sheet.addEventListener('pointerdown', function (e) {
      if (!handle(e) || e.target.closest('button')) return;
      startY = e.clientY; dy = 0;
      sheet.style.transition = 'none';
      sheet.setPointerCapture(e.pointerId);
    });
    sheet.addEventListener('pointermove', function (e) {
      if (startY === null) return;
      dy = Math.max(0, e.clientY - startY);
      sheet.style.transform = 'translateY(' + dy + 'px)';
    });
    var end = function () {
      if (startY === null) return;
      startY = null;
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (dy > 90) closeSheet();
    };
    sheet.addEventListener('pointerup', end);
    sheet.addEventListener('pointercancel', end);
  });

  // ===== 스테퍼 =====
  function stepper(value, min, max, onChange, small) {
    var wrap = document.createElement('div');
    wrap.className = 'stepper' + (small ? ' sm' : '');
    wrap.innerHTML = '<button type="button" class="minus" aria-label="빼기">−</button><output>' + value + '</output><button type="button" class="plus" aria-label="더하기">+</button>';
    var out = $('output', wrap), minus = $('.minus', wrap), plus = $('.plus', wrap);
    function sync() {
      out.textContent = value;
      minus.disabled = value <= min;
      plus.disabled = value >= max();
    }
    minus.addEventListener('click', function () { if (value > min) { value--; sync(); onChange(value); } });
    plus.addEventListener('click', function () {
      if (value < max()) { value++; sync(); onChange(value); }
      else toast('더 담을 수 없는 상품이에요', 'error');
    });
    wrap.sync = sync;
    sync();
    return wrap;
  }

  // ===== 상품 시트 =====
  var ps = $('#productSheet');
  var psState = null;

  function openProduct(id) {
    if (!ps) return;
    api('GET', '/api/products/' + id).then(function (j) {
      var p = j.product;
      GM.live = j.live;
      var inCart = load().filter(function (l) { return l.productId === p.id; })[0];
      var already = inCart ? lineQty(inCart) : 0;
      psState = { p: p, packageType: 'full', opened: 0, unopened: 0, card: 0, qty: p.useOpenOption ? 0 : 1, already: already };
      var body = $('[data-ps-body]', ps);
      var packagePrice = function () {
        if (!p.usePackageOption) return p.price;
        return psState.packageType === 'full' ? (p.fullBoxPrice || p.price) : (p.loosePrice || p.price);
      };
      var imgs = p.images.length
        ? p.images.map(function (i) { return '<div class="thumb"><img src="/img/' + i + '" alt=""></div>'; }).join('')
        : '<div class="thumb"><span class="ph">?</span></div>';
      var packageHtml = p.usePackageOption
        ? '<div class="detail-package-box"><div class="detail-option-label"><strong>상품 구성을 골라 주세요</strong><span>풀박 또는 낱박</span></div><div class="detail-package-options"><label class="detail-package-option"><input type="radio" name="sheetPackage" value="full" checked><span class="package-option-content"><span class="package-option-image">' + (p.fullBoxImageId ? '<img src="/img/' + p.fullBoxImageId + '" alt="풀박">' : '풀박') + '</span><span><strong>풀박</strong><small>풀박스 구성</small>' + (p.price != null ? '<b>' + won(p.fullBoxPrice || p.price) + '</b>' : '') + '</span></span></label><label class="detail-package-option"><input type="radio" name="sheetPackage" value="loose"><span class="package-option-content"><span class="package-option-image">' + (p.looseImageId ? '<img src="/img/' + p.looseImageId + '" alt="낱박">' : '낱박') + '</span><span><strong>낱박</strong><small>패키지 내 개별 상품</small>' + (p.price != null ? '<b>' + won(p.loosePrice || p.price) + '</b>' : '') + '</span></span></label></div></div>'
        : '';
      body.innerHTML =
        '<div class="p-gallery">' + imgs + '</div>' +
        '<div class="p-name" id="ps-name">' + esc(p.name) + '</div>' +
        (p.price != null ? '<div class="p-price" data-sheet-price>' + won(packagePrice()) + '</div>' : '<div class="price hidden">가격은 방송 중에 공개돼요</div>') +
        '<div class="p-meta">' +
          (p.soldout ? '<span class="chip gray">품절</span>' : (p.showStock ? '<span class="chip">재고 ' + p.stock + '개</span>' : '')) +
          (already ? '<span class="chip gray">장바구니에 ' + already + '개</span>' : '') +
        '</div>' +
        packageHtml +
        (p.expectedShippingText ? '<p class="expected-shipping">예상 배송일 <strong>' + esc(p.expectedShippingText) + '</strong></p>' : '') +
        (p.shortDescription ? '<div class="p-desc">' + esc(p.shortDescription) + '</div>' : '') +
        '<div class="opt-box" data-ps-opts></div>';
      var opts = $('[data-ps-opts]', body);
      $$('input[name="sheetPackage"]', body).forEach(function (radio) {
        radio.addEventListener('change', function () {
          if (!this.checked) return;
          psState.packageType = this.value;
          var priceEl = $('[data-sheet-price]', body);
          if (priceEl) priceEl.textContent = won(packagePrice());
          syncAdd();
        });
      });
      var left = function () { return Math.max(0, p.stock - already); };
      var total = function () { return p.useOpenOption ? psState.opened + psState.unopened + psState.card : psState.qty; };
      if (!p.soldout && j.live) {
        if (p.useOpenOption) {
          opts.innerHTML = '<div class="opt-label">개봉 방법을 골라 주세요 <small>수량별로 나눠 담을 수 있어요</small></div>';
          [['opened', OPT.opened, '방송에서 바로 개봉해 드려요'], ['unopened', OPT.unopened, '포장 그대로 보내 드려요'], ['card', OPT.card, '카드팩까지 방송에서 개봉해 드려요']].forEach(function (o) {
            var row = document.createElement('div');
            row.className = 'opt-row';
            row.innerHTML = '<div class="lbl">' + o[1] + '<small>' + o[2] + '</small></div>';
            var st = stepper(0, 0, function () { return psState[o[0]] + (left() - total()); }, function (v) { psState[o[0]] = v; syncAdd(); syncSteppers(); });
            row.appendChild(st);
            opts.appendChild(row);
          });
        } else {
          var row = document.createElement('div');
          row.className = 'opt-row';
          row.innerHTML = '<div class="lbl">수량</div>';
          row.appendChild(stepper(Math.min(1, left()), Math.min(1, left()), function () { return left(); }, function (v) { psState.qty = v; syncAdd(); }));
          psState.qty = Math.min(1, left());
          opts.appendChild(row);
        }
      }
      function syncSteppers() { $$('.stepper', opts).forEach(function (s) { s.sync(); }); }
      syncAdd();
      openSheet(ps);
    }).catch(function (e) { toast(e.message, 'error'); });
  }

  function syncAdd() {
    var btn = $('[data-ps-add]', ps);
    if (!psState) return;
    var p = psState.p;
    var n = p.useOpenOption ? psState.opened + psState.unopened + psState.card : psState.qty;
    btn.disabled = false;
    if (!GM.live) { btn.textContent = '방송 중에만 주문할 수 있어요'; btn.disabled = true; return; }
    if (p.soldout) { btn.textContent = '품절된 상품이에요'; btn.disabled = true; return; }
    if (psState.already >= p.stock) { btn.textContent = '더 담을 수 없는 상품이에요'; btn.disabled = true; return; }
    if (n < 1) { btn.textContent = p.useOpenOption ? '개봉 방법과 수량을 골라 주세요' : '수량을 골라 주세요'; btn.disabled = true; return; }
    var unitPrice = p.usePackageOption ? (psState.packageType === 'full' ? (p.fullBoxPrice || p.price) : (p.loosePrice || p.price)) : p.price;
    btn.innerHTML = n + '개 담기' + (unitPrice != null ? ' <span class="sub">' + won(unitPrice * n) + '</span>' : '');
  }

  if (ps) {
    $('[data-ps-add]', ps).addEventListener('click', function () {
      if (!psState) return;
      var p = psState.p;
      var cart = load();
       var packageType = p.usePackageOption ? psState.packageType : 'standard';
       var unitPrice = p.usePackageOption ? (packageType === 'full' ? (p.fullBoxPrice || p.price) : (p.loosePrice || p.price)) : p.price;
       var line = cart.filter(function (l) { return l.productId === p.id && (l.packageType || 'standard') === packageType; })[0];
       if (!line) {
         line = { productId: p.id, name: p.name, price: unitPrice, packageType: packageType, imageId: p.images[0] || null, option: p.useOpenOption, opened: 0, unopened: 0, card: 0, qty: 0 };
         cart.push(line);
       }
       line.price = unitPrice;
      line.name = p.name;
      line.price = p.price;
      if (p.useOpenOption) {
        line.opened = (line.opened || 0) + psState.opened;
        line.unopened = (line.unopened || 0) + psState.unopened;
        line.card = (line.card || 0) + psState.card;
      } else {
        line.qty = (line.qty || 0) + psState.qty;
      }
      save(cart);
      closeSheet();
      toast('장바구니에 담았어요 ♥');
    });
  }

  $$('[data-product]').forEach(function (card) {
    // 상품은 항상 독립 상세 페이지로 이동합니다. 상품 모달을 열지 않습니다.
    var id = Number(card.getAttribute('data-product'));
    if (!id) return;
    card.addEventListener('click', function (e) {
      if (card.tagName.toLowerCase() === 'a') return;
      e.preventDefault();
      location.href = '/p/' + id;
    });
  });

  // ===== 장바구니 시트 =====
  var cs = $('#cartSheet');
  function renderCart(quote) {
    if (!cs) return;
    var cart = load();
    var body = $('[data-cart-body]', cs);
    var foot = $('[data-cart-foot]', cs);
    if (!cart.length) {
      body.innerHTML = '<div class="empty"><div class="big">?</div><p>장바구니가 비어 있어요</p></div>';
      foot.hidden = true;
      return;
    }
    foot.hidden = false;
    var problems = {};
    if (quote) quote.lines.forEach(function (l) { problems[l.productId + ':' + (l.packageType || 'standard')] = l; });
    body.innerHTML = '';
    cart.forEach(function (l, idx) {
      var q = problems[l.productId + ':' + (l.packageType || 'standard')];
      var row = document.createElement('div');
      row.className = 'cart-line';
      row.innerHTML =
        '<div class="thumb">' + (l.imageId ? '<img src="/img/' + l.imageId + '" alt="">' : '<span class="ph">?</span>') + '</div>' +
          '<div class="info">' +
          '<div class="nm">' + esc(l.name) + '</div>' +
          (l.packageType && l.packageType !== 'standard' ? '<div class="opt">' + (l.packageType === 'full' ? '풀박 · 풀박스 구성' : '낱박 · 패키지 내 개별 상품') + '</div>' : '') +
          (q && q.problem ? '<div class="problem">' + esc(q.problem) + '</div>' : '') +
          '<div class="ctrl" data-ctrl></div>' +
          '<div class="ctrl"><span class="amt num">' + (GM.showPrice && l.price != null ? won(l.price * lineQty(l)) : '가격 방송 중 공개') + '</span><button type="button" class="rm">삭제</button></div>' +
        '</div>';
      var ctrl = $('[data-ctrl]', row);
      var stock = q && q.stock != null ? q.stock : 99;
      var update = function () { save(cart); renderCart(quote); };
      if (l.option) {
        var split = document.createElement('div');
        split.className = 'split';
        [['opened', OPT.opened], ['unopened', OPT.unopened], ['card', OPT.card]].forEach(function (o) {
          var s = document.createElement('div');
          s.className = 's';
          s.innerHTML = '<span>' + o[1] + '</span>';
          s.appendChild(stepper(l[o[0]] || 0, 0, function () { return (l[o[0]] || 0) + Math.max(0, stock - lineQty(l)); }, function (v) {
            l[o[0]] = v;
            if (lineQty(l) === 0) cart.splice(idx, 1);
            update();
          }, true));
          split.appendChild(s);
        });
        ctrl.appendChild(split);
      } else {
        ctrl.appendChild(stepper(l.qty || 1, 1, function () { return stock; }, function (v) { l.qty = v; update(); }, true));
      }
      // 2026-11-23 상품마다 박스 제거 선택
      var nb = document.createElement('label');
      nb.className = 'nobox';
      nb.innerHTML = '<input type="checkbox"' + (l.noBox ? ' checked' : '') + '><span>박스 제거</span>';
      $('input', nb).addEventListener('change', function () { l.noBox = this.checked; save(cart); });
      ctrl.parentNode.insertBefore(nb, ctrl.nextSibling);
      $('.rm', row).addEventListener('click', function () { cart.splice(idx, 1); update(); });
      body.appendChild(row);
    });
    $('[data-cart-total]', cs).textContent = GM.showPrice ? won(cartTotal(cart)) : '방송 중 공개';
    var hint = $('[data-cart-hint]', cs);
    if (hint) hint.textContent = won(GM.freeShip) + ' 이상 바로배송 무료 · 킵은 배송비를 지금 결제하지 않아요';
    var go = $('[data-go-checkout]', cs);
    var bad = quote && quote.hasProblem;
    go.classList.toggle('disabled', !GM.live || bad);
    go.textContent = !GM.live ? '방송 중에만 주문할 수 있어요' : bad ? '품절·재고 부족 상품을 정리해 주세요' : '장바구니 상품 바로 구매';
    go.href = GM.loggedIn ? '/checkout' : '/login?next=/checkout';
    var direct = $('[data-cart-direct]');
    if (direct) {
      direct.href = GM.loggedIn ? '/checkout' : '/login?next=/checkout';
      direct.classList.toggle('disabled', !GM.live || bad);
      direct.setAttribute('aria-disabled', (!GM.live || bad) ? 'true' : 'false');
    }
  }

  function refreshQuote() {
    var cart = load();
    if (!cart.length) return Promise.resolve(null);
    return api('POST', '/api/cart/quote', { lines: toLines(cart) }).then(function (q) {
      // 최신 가격 반영
      var byId = {};
      q.lines.forEach(function (l) { byId[l.productId + ':' + (l.packageType || 'standard')] = l; });
      // 삭제·비공개 처리된 상품은 서버 견적에 포함되지 않으므로 브라우저 장바구니에서도 제거한다.
      cart = cart.filter(function (l) { return !!byId[l.productId + ':' + (l.packageType || 'standard')]; });
      cart.forEach(function (l) {
        var x = byId[l.productId + ':' + (l.packageType || 'standard')];
        if (x) { if (x.unitPrice != null) l.price = x.unitPrice; if (x.name) l.name = x.name; if (x.imageId) l.imageId = x.imageId; }
      });
      save(cart);
      return q;
    }).catch(function () { return null; });
  }

  $$('[data-open-cart]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.preventDefault();
      if (!cs) return;
      renderCart(null);
      openSheet(cs);
      refreshQuote().then(function (q) { renderCart(q); });
    });
  });

  document.addEventListener('click', function (e) {
    var direct = e.target.closest('[data-cart-direct]');
    if (!direct || !direct.classList.contains('disabled')) return;
    e.preventDefault();
    toast(!GM.live ? '방송 중에만 바로 구매할 수 있어요' : '품절·재고 부족 상품을 먼저 정리해 주세요', 'error');
  });

  // ===== 방송 상태 / 재고 폴링 (5초) =====
  function applyLive(j) {
    var changed = GM.live !== j.live;
    GM.live = j.live;
    GM.showPrice = j.showPrice;
    $$('[data-live-pill]').forEach(function (el) { el.classList.toggle('on', j.live); el.textContent = j.live ? 'LIVE' : 'OFF'; });
    var banner = $('[data-live-banner]');
    if (banner) {
      banner.classList.toggle('off', !j.live);
      $('.heart', banner).textContent = j.live ? '♥' : '✦';
      $('[data-live-text]', banner).textContent = j.live ? '지금 방송 중! 담고 바로 주문하세요' : '방송 중에만 주문할 수 있어요. 방송 때 만나요!';
      var q = $('[data-live-queue]', banner);
      if (q) q.hidden = !j.live;
    }
    var map = {};
    j.products.forEach(function (p) { map[p.id] = p; });
    $$('[data-product]').forEach(function (card) {
      var p = map[card.getAttribute('data-product')];
      if (!p) { card.hidden = true; return; }
      card.hidden = false;
      card.classList.toggle('soldout', p.soldout);
      var pl = $('[data-price-label]', card);
      if (pl) {
        pl.classList.toggle('hidden', p.price == null);
        pl.textContent = p.price != null ? won(p.price) : '방송 중 공개';
      }
      var sl = $('[data-stock-label]', card);
      if (sl) {
        sl.textContent = p.soldout ? '품절' : (j.showStock && p.stock <= 3 ? '남은 ' + p.stock + '개' : '');
        sl.classList.toggle('low', j.showStock && !p.soldout && p.stock <= 3);
      }
    });
    // 품절 상품은 각 목록 맨 아래로 (나머지는 관리자 정렬 순서 유지)
    $$('[data-grid]').forEach(function (grid) {
      var cards = $$('[data-product]', grid);
      var key = function (c) { return [c.classList.contains('soldout') ? 1 : 0, +c.getAttribute('data-sort') || 0, +c.getAttribute('data-product')]; };
      var sorted = cards.slice().sort(function (a, b) { var x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
      if (sorted.some(function (c, i) { return c !== cards[i]; })) sorted.forEach(function (c) { grid.appendChild(c); });
    });
    if (changed) {
      if (psState) syncAdd();
      document.dispatchEvent(new CustomEvent('gm:live', { detail: j }));
      toast(j.live ? '방송이 시작됐어요! 지금 주문할 수 있어요' : '방송이 끝나 주문이 마감됐어요', j.live ? '' : 'error');
    }
    renderBadge();
  }
  // 상품이 새로 추가되면 목록을 다시 받아야 하므로 새로고침
  var isHome = document.body.classList.contains('has-cartbar');
  var knownIds = $$('[data-product]').map(function (c) { return c.getAttribute('data-product'); }).sort().join(',');
  // 방송 중에는 5초, 방송이 아닐 때는 15초마다 조회한다(트래픽 절감).
  var liveNow = !!(GM && GM.live);
  var pollTimer = null;
  function schedule() { clearTimeout(pollTimer); pollTimer = setTimeout(poll, liveNow ? 5000 : 15000); }
  function reloadOnce() {
    // 새로고침이 되풀이되면 접속자마다 페이지를 계속 다시 받게 되므로 1분에 한 번만 허용한다.
    try {
      var last = Number(sessionStorage.getItem('gm_list_reload') || 0);
      if (Date.now() - last < 60000) return false;
      sessionStorage.setItem('gm_list_reload', String(Date.now()));
    } catch (e) { /* 저장소를 못 쓰면 그대로 새로고침 */ }
    location.reload();
    return true;
  }
  function poll() {
    if (document.hidden) { schedule(); return; }
    fetch('/api/live', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) return;
      liveNow = !!j.live;
      if (isHome && !openSheetEl) {
        var ids = j.products.map(function (p) { return String(p.id); }).sort().join(',');
        if (ids !== knownIds && reloadOnce()) return;
      }
      applyLive(j);
    }).catch(function () { /* 네트워크 일시 오류 무시 */ }).then(schedule);
  }
  schedule();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });

  // ===== 주소 찾기 (다음 우편번호, 바텀시트 임베드) =====
  var pcSheet = $('#postcodeSheet');
  var pcBackdrop = $('[data-pc-backdrop]');
  var pcTarget = null;
  function closePostcode() {
    if (!pcSheet) return;
    pcSheet.classList.remove('open');
    if (pcBackdrop) pcBackdrop.classList.remove('open');
    setTimeout(function () { pcSheet.hidden = true; }, 300);
  }
  $$('[data-postcode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!window.daum || !window.daum.Postcode) { toast('주소 검색을 불러오는 중이에요. 잠시 후 다시 눌러 주세요', 'error'); return; }
      pcTarget = btn.closest('form, [data-addr-form], [data-release], .panel') || document;
      var wrap = $('[data-pc-wrap]', pcSheet);
      wrap.innerHTML = '';
      new window.daum.Postcode({
        width: '100%',
        height: '100%',
        oncomplete: function (d) {
          var addr = d.roadAddress || d.jibunAddress;
          if (d.buildingName && d.apartment === 'Y') addr += ' (' + d.buildingName + ')';
          var z = $('[data-zip]', pcTarget), a1 = $('[data-addr1]', pcTarget), a2 = $('[data-addr2]', pcTarget);
          if (z) z.value = d.zonecode;
          if (a1) a1.value = addr;
          closePostcode();
          if (a2) setTimeout(function () { a2.value = ''; a2.focus(); }, 320);
        },
      }).embed(wrap);
      pcSheet.hidden = false;
      requestAnimationFrame(function () { pcSheet.classList.add('open'); if (pcBackdrop) pcBackdrop.classList.add('open'); });
    });
  });
  $$('[data-close-postcode]').forEach(function (b) { b.addEventListener('click', closePostcode); });
  if (pcBackdrop) pcBackdrop.addEventListener('click', closePostcode);

  // ===== 복사 버튼 =====
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy');
      var done = function () { toast('복사했어요'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      } else { fallbackCopy(text); done(); }
    });
  });
  function fallbackCopy(text) {
    var t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(t);
  }

  // ===== 리뷰 사진 선택 미리보기 =====
  $$('[data-review-photo-input]').forEach(function (input) {
    var field = input.closest('[data-review-photo-field]') || input.parentNode;
    var preview = field ? $('[data-review-photo-preview]', field) : null;
    var fileName = field ? $('[data-review-file-name]', field) : null;
    if (!preview) return;
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      var allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (files.length > 3) {
        input.value = '';
        if (fileName) fileName.textContent = '선택된 사진 없음';
        preview.innerHTML = '';
        preview.hidden = true;
        toast('사진은 최대 3장까지 선택할 수 있어요', 'error');
        return;
      }
      if (files.some(function (file) { return !allowed.includes(file.type) || file.size > 5 * 1024 * 1024; })) {
        input.value = '';
        if (fileName) fileName.textContent = '선택된 사진 없음';
        preview.innerHTML = '';
        preview.hidden = true;
        toast('JPG, PNG, WEBP, GIF 사진을 장당 5MB 이하로 올려 주세요', 'error');
        return;
      }
      if (fileName) fileName.textContent = files.length ? files.map(function (file) { return file.name; }).join(', ') : '선택된 사진 없음';
      preview.innerHTML = '';
      preview.hidden = files.length === 0;
      files.forEach(function (file) {
        var url = URL.createObjectURL(file);
        var frame = document.createElement('span');
        var image = document.createElement('img');
        frame.className = 'review-photo-preview-item';
        image.src = url;
        image.alt = '선택한 후기 사진';
        image.width = 240;
        image.height = 180;
        image.onload = function () { URL.revokeObjectURL(url); };
        frame.appendChild(image);
        preview.appendChild(frame);
      });
    });
  });

  window.addEventListener("storage", function (e) { if (e.key === KEY) renderBadge(); });
  renderBadge();

  window.GMShop = { api: api, toast: toast, load: load, save: save, toLines: toLines, won: won, esc: esc, lineQty: lineQty, openSheet: openSheet, closeSheet: closeSheet, refreshQuote: refreshQuote, OPT: OPT };

  // ===== 메인 팝업 (관리자 팝업 관리) =====
  (function () {
    var modal = $('[data-notice-modal]');
    if (!modal) return;
    var today = new Date();
    var version = modal.getAttribute('data-notice-version') || '';
    var todayKey = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate() + '|' + version;
    var store = function (area, key, value) {
      try { if (value === undefined) return window[area].getItem(key); window[area].setItem(key, value); } catch (e) { return null; }
    };
    if (store('localStorage', 'gm_notice_hide') === todayKey || store('sessionStorage', 'gm_notice_seen') === version) return;
    var lastFocus = null;
    function close(hideToday) {
      store('sessionStorage', 'gm_notice_seen', version);
      if (hideToday) store('localStorage', 'gm_notice_hide', todayKey);
      modal.classList.remove('open');
      document.documentElement.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { modal.hidden = true; }, 240);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function onKey(e) { if (e.key === 'Escape') close(false); }
    $$('[data-src]', modal).forEach(function (img) { img.src = img.getAttribute('data-src'); });
    // 팝업이 여러 개면 가로로 넘겨 본다.
    var track = $('[data-notice-track]', modal);
    var slides = $$('[data-notice-slide]', modal);
    var count = $('[data-notice-count]', modal);
    var current = 0;
    function go(index) {
      current = Math.max(0, Math.min(slides.length - 1, index));
      track.scrollTo({ left: slides[current].offsetLeft, behavior: 'smooth' });
    }
    if (slides.length > 1) {
      $('[data-notice-prev]', modal).addEventListener('click', function () { go(current === 0 ? slides.length - 1 : current - 1); });
      $('[data-notice-next]', modal).addEventListener('click', function () { go(current === slides.length - 1 ? 0 : current + 1); });
      track.addEventListener('scroll', function () {
        var index = Math.round(track.scrollLeft / track.clientWidth);
        if (index !== current && slides[index]) current = index;
        count.textContent = (current + 1) + ' / ' + slides.length;
      }, { passive: true });
    }
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(function () { modal.classList.add('open'); });
    var closeBtn = $('[data-notice-close]', modal);
    closeBtn.addEventListener('click', function () { close(false); });
    $('[data-notice-today]', modal).addEventListener('click', function () { close(true); });
    modal.addEventListener('click', function (e) { if (e.target === modal) close(false); });
    document.addEventListener('keydown', onKey);
    closeBtn.focus({ preventScroll: true });
  })();
  // 상품 보기 전환: 전체상품 / 샘플 (다른 화면 다녀와도 유지)
  (function () {
    var head = $('[data-view-head]');
    if (!head) return;
    var root = head.parentNode, VKEY = 'gm_view';
    var setView = function (v) {
      root.classList.toggle('view-sample', v === 'sample');
      $$('[data-view-btn]', head).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-view-btn') === v ? 'true' : 'false'); });
      try { sessionStorage.setItem(VKEY, v); } catch (e) {}
    };
    head.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-view-btn]');
      if (b) setView(b.getAttribute('data-view-btn'));
    });
    try { if (sessionStorage.getItem(VKEY) === 'sample') setView('sample'); } catch (e) {}
  })();

  // ===== 상품 분류: 종류(인형/미니피규어) × 인형 이름. 주소 #c=이름&k=figure 로 공유 가능 =====
  (function () {
    var bar = document.querySelector('[data-cat-bar]');
    if (!bar) return;
    var grid = document.querySelector('[data-view-grid="live"]');
    var empty = bar.querySelector('[data-cat-empty]');
    var state = { k: '', c: '' };
    function apply(push) {
      var shown = 0;
      Array.prototype.forEach.call(grid.querySelectorAll('[data-product]'), function (card) {
        var ok = (!state.k || card.getAttribute('data-kind') === state.k) && (!state.c || card.getAttribute('data-char') === state.c);
        card.hidden = !ok;
        if (ok) shown++;
      });
      Array.prototype.forEach.call(bar.querySelectorAll('[data-cat-kind]'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cat-kind') === state.k ? 'true' : 'false'); });
      Array.prototype.forEach.call(bar.querySelectorAll('[data-cat-char]'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cat-char') === state.c ? 'true' : 'false'); });
      if (empty) empty.hidden = shown > 0;
      if (push) {
        var h = [];
        if (state.c) h.push('c=' + encodeURIComponent(state.c));
        if (state.k) h.push('k=' + state.k);
        try { history.replaceState(null, '', h.length ? '#' + h.join('&') : location.pathname + location.search); } catch (e) {}
      }
    }
    bar.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-cat-kind],[data-cat-char]');
      if (!b) return;
      if (b.hasAttribute('data-cat-kind')) state.k = b.getAttribute('data-cat-kind');
      else { var c = b.getAttribute('data-cat-char'); state.c = state.c === c ? '' : c; }
      apply(true);
      if (b.hasAttribute('data-cat-char') && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
    // 가로 스크롤 끝 페이드
    var chips = bar.querySelector('.cat-chips');
    if (chips) {
      var wrap = chips.parentNode;
      var edge = function () {
        wrap.classList.toggle('at-start', chips.scrollLeft < 4);
        wrap.classList.toggle('at-end', chips.scrollLeft + chips.clientWidth > chips.scrollWidth - 4);
      };
      chips.addEventListener('scroll', edge, { passive: true });
      window.addEventListener('resize', edge);
      edge();
    }
    var m = location.hash.match(/c=([^&]+)/), k = location.hash.match(/k=(doll|figure)/);
    if (m) { try { state.c = decodeURIComponent(m[1]); } catch (e) {} }
    if (k) state.k = k[1];
    if (m || k) apply(false);
  })();
})();

// 메인: 헤더가 초록 배너 위에 겹쳐 있다가 내려가면 배경이 깔림
(function () {
  var top = document.querySelector('.top');
  if (!top || !document.querySelector('.hero')) return;
  var root = document.documentElement;
  function size() { root.style.setProperty('--top-h', top.offsetHeight + 'px'); }
  function onScroll() { top.classList.toggle('is-solid', window.scrollY > 8); }
  size(); onScroll();
  window.addEventListener('resize', size, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
})();
