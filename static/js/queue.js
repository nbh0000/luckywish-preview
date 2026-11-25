/* 순서표: 방송 중 8초, 방송 외 30초마다 새로 받아 바꾼다. 화면이 가려져 있으면 쉬고, 돌아오면 바로 받는다.
   서버는 ETag 로 304 를 돌려주므로 바뀐 게 없으면 거의 데이터가 오가지 않는다. */
(function () {
  var box = document.querySelector('[data-queue]');
  if (!box) return;
  var sub = document.querySelector('[data-queue-live]');
  var live = !!(window.GM && window.GM.live);
  var timer = 0, last = box.innerHTML, busy = false;

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(load, ms);
  }

  function load() {
    if (document.hidden) return;
    if (busy) return;
    busy = true;
    fetch('/api/queue', { headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (d) {
        live = !!d.live;
        if (sub) sub.textContent = live ? '방송과 함께 실시간으로 바뀌어요' : '방송이 시작되면 실시간으로 바뀌어요';
        if (d.html !== last) {
          var before = box.querySelector('.q-now-name');
          var beforeName = before ? before.textContent : '';
          box.innerHTML = d.html;
          last = d.html;
          var after = box.querySelector('.q-now-name');
          // 지금 개봉하는 사람이 바뀐 순간만 한 번 알린다
          if (after && after.textContent !== beforeName) {
            var card = box.querySelector('.q-now');
            if (card) { card.classList.remove('changed'); void card.offsetWidth; card.classList.add('changed'); }
          }
        }
      })
      .catch(function () { /* 잠깐 끊겨도 마지막 순서표를 그대로 두고 다음 차례에 다시 받는다 */ })
      .then(function () { busy = false; schedule(live ? 8000 : 30000); });
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) load();
    else clearTimeout(timer);
  });
  schedule(live ? 8000 : 30000);
})();
