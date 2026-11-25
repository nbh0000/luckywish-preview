/* 페이앱 카드·간편결제·가상계좌, 주문/출고요청 취소, 킵 출고 요청 */
(function () {
  'use strict';
  var S = window.GMShop;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /**
   * 페이앱 결제창으로 이동. 결제 완료는 서버가 페이앱 결제 통보로 반영하고,
   * 결제 후에는 /pay/return → 주문 화면으로 돌아온다.
   */
  function requestCard(payment, afterUrl) {
    if (!payment || !payment.payurl) {
      S.toast('결제창을 열지 못했어요. 주문 내역에서 다시 결제해 주세요', 'error');
      setTimeout(function () { location.href = afterUrl; }, 1200);
      return Promise.resolve();
    }
    var total = $('[data-sum-total]');
    var box = document.createElement('div');
    box.className = 'pay-handoff';
    box.setAttribute('role', 'status');
    var vbank = payment.kind === 'vbank';
    box.innerHTML = vbank
      ? '<div class="box"><strong>가상계좌 발급 화면으로 이동해요</strong><div class="amt"></div><p class="msg">은행을 고르면 내 전용 계좌가 나와요<br>발급 후 10분 안에 입금해 주세요<br>미입금 시 주문이 자동 취소돼요</p><div class="bar"><i></i></div></div>'
      : '<div class="box"><strong>결제창으로 이동해요</strong><div class="amt"></div><p class="msg">카드 · 카카오페이 · 네이버페이 · 토스페이 중<br>편한 방법으로 결제해 주세요</p><div class="bar"><i></i></div></div>';
    var amount = total ? total.textContent.trim() : '';
    if (/\d/.test(amount)) $('.amt', box).textContent = amount; else $('.amt', box).remove();
    document.body.appendChild(box);
    requestAnimationFrame(function () { box.classList.add('on'); });
    setTimeout(function () { location.href = payment.payurl; }, 450);
    // 뒤로 가기로 돌아오면 안내를 걷고 주문 화면으로 보낸다.
    window.addEventListener('pageshow', function (e) { if (e.persisted) location.href = afterUrl; });
    return new Promise(function () {});
  }
  window.GMPay = { requestCard: requestCard };

  // 결제 대기 건 다시 결제
  $$('[data-repay]').forEach(function (b) {
    b.addEventListener('click', function () {
      var no = b.getAttribute('data-repay');
      var kind = b.getAttribute('data-kind') === 'shipment' ? 'shipments' : 'orders';
      var after = kind === 'orders' ? '/orders/' + no : '/my/shipments/' + no;
      b.disabled = true;
      S.api('POST', '/api/' + kind + '/' + encodeURIComponent(no) + '/pay').then(function (r) {
        return requestCard(r.payment, after);
      }).catch(function (e) { S.toast(e.message, 'error'); }).then(function () { b.disabled = false; });
    });
  });

  // 확인 단계: 버튼을 한 번 더 눌러야 실행 (브라우저 confirm 대신)
  function twoStep(btn, label, run) {
    btn.addEventListener('click', function () {
      if (!btn.dataset.armed) {
        btn.dataset.armed = '1';
        btn.dataset.orig = btn.textContent;
        btn.textContent = label;
        btn.classList.add('soft');
        setTimeout(function () { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.orig; btn.classList.remove('soft'); } }, 4000);
        return;
      }
      delete btn.dataset.armed;
      btn.disabled = true;
      run().catch(function (e) { S.toast(e.message, 'error'); btn.disabled = false; btn.textContent = btn.dataset.orig; });
    });
  }

  $$('[data-cancel-order]').forEach(function (b) {
    twoStep(b, '한 번 더 누르면 주문이 취소돼요', function () {
      return S.api('POST', '/api/orders/' + encodeURIComponent(b.getAttribute('data-cancel-order')) + '/cancel').then(function () { location.reload(); });
    });
  });
  $$('[data-cancel-shipment]').forEach(function (b) {
    twoStep(b, '한 번 더 누르면 출고 요청이 취소돼요', function () {
      return S.api('POST', '/api/shipments/' + encodeURIComponent(b.getAttribute('data-cancel-shipment')) + '/cancel').then(function () { location.href = '/my/keep'; });
    });
  });

  // 킵 출고 요청
  var rel = $('[data-release]');
  if (rel) {
    $$('input[name="payment"]', rel).forEach(function (r) {
      r.addEventListener('change', function () {
        var dep = $('[data-depositor]', rel);
        if (dep) dep.hidden = r.value !== 'bank' || !r.checked;
      });
    });
    var go = $('[data-release-go]', rel);
    go.addEventListener('click', function () {
      var v = function (n) { var el = $('[name="' + n + '"]', rel); return el ? el.value : ''; };
      var pm = ($('input[name="payment"]:checked', rel) || {}).value || null;
      go.disabled = true;
      S.api('POST', '/api/keep/release', {
        paymentMethod: pm,
        depositorName: v('depositorName'),
        recipient: { name: v('name'), phone: v('phone'), zipcode: v('zipcode'), address1: v('address1'), address2: v('address2'), memo: v('memo') },
      }).then(function (r) {
        if (r.payment) return requestCard(r.payment, r.redirect);
        location.href = r.redirect;
      }).catch(function (e) { S.toast(e.message, 'error'); go.disabled = false; });
    });
  }
})();
