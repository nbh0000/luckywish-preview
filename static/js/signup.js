(function () {
  'use strict';

  var button = document.querySelector('[data-address-search]');
  if (!button) return;

  // 팝업(open)은 유튜브·카카오톡·인스타 앱 안 브라우저에서 막히는 경우가 많아 화면 안 레이어(embed)로 띄운다.
  var layer = null;
  var box = null;
  var lastFocus = null;

  function close() {
    if (!layer) return;
    layer.hidden = true;
    document.documentElement.classList.remove('postcode-lock');
    if (box) box.innerHTML = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function buildLayer() {
    layer = document.createElement('div');
    layer.className = 'postcode-layer';
    layer.hidden = true;
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', '주소 검색');
    layer.innerHTML = '<div class="postcode-card"><div class="postcode-head"><strong>주소 검색</strong><button type="button" class="postcode-close" aria-label="닫기">닫기</button></div><div class="postcode-box"></div></div>';
    document.body.appendChild(layer);
    box = layer.querySelector('.postcode-box');
    layer.querySelector('.postcode-close').addEventListener('click', close);
    layer.addEventListener('click', function (event) {
      if (event.target === layer) close();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && layer && !layer.hidden) close();
    });
  }

  button.addEventListener('click', function () {
    if (!window.daum || !window.daum.Postcode) {
      window.alert('주소 검색 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (!layer) buildLayer();
    lastFocus = document.activeElement;
    box.innerHTML = '';
    layer.hidden = false;
    document.documentElement.classList.add('postcode-lock');
    new window.daum.Postcode({
      width: '100%',
      height: '100%',
      oncomplete: function (data) {
        var zipcode = document.querySelector('[data-signup-zipcode]');
        var address = document.querySelector('[data-signup-address]');
        var detail = document.querySelector('input[name="address2"]');
        var selected = data.roadAddress || data.jibunAddress || '';
        if (zipcode) zipcode.value = data.zonecode || '';
        if (address) address.value = selected;
        lastFocus = detail;
        close();
      }
    }).embed(box, { autoClose: false });
  });
})();
