(function () {
  'use strict';

  // v19.9.4(A안 실측): 관찰 전용 로컬 요청 탭.
  //
  // 직접 읽기 시험(v19.9.3)이 127.0.0.1:25625/datas 에서 HTTP 200 + `{}` 를
  // 받았다 — 전송로는 뚫렸는데 그 호출 형태로는 데이터가 안 나온다.  tmo.gg
  // 페이지는 데이터를 받아서 화면을 그리고 있으므로, 페이지가 실제로 보내는
  // 요청(경로·메서드·바디)과 실제로 받는 응답을 그대로 보면 판정이 끝난다.
  //
  // 계약(ord_page_unthrottle 와 동일한 보수성):
  //  - 관찰만 한다.  요청을 바꾸지도, 막지도, 지연시키지도 않는다 — 원 함수를
  //    항상 그대로 apply 하고, 기록은 응답 사본(clone)에서만 읽는다.
  //  - 127.0.0.1:25625 로 가는 요청만 본다.  다른 트래픽은 건드리지 않는다.
  //  - 모든 단계가 try/catch — 탭이 죽어도 페이지는 아무 영향이 없다.
  //  - 네트워크를 새로 만들지 않는다(fetch/XHR 발신 없음) — 언스로틀러의
  //    "네트워크 무개입" 계약은 그 파일에, 이 파일은 "발신 무개입"이 계약.
  if (window.__ORD_TMO_NETTAP__) return;
  window.__ORD_TMO_NETTAP__ = true;

  const LOCAL = /^https?:\/\/127\.0\.0\.1:25625\//;
  function report(entry) {
    try { window.postMessage(Object.assign({__ord: 'tmo-local-request'}, entry), '*'); } catch (_) {}
  }
  function snippetOf(text) { return String(text || '').slice(0, 600); }

  try {
    const nativeFetch = window.fetch;
    if (typeof nativeFetch === 'function') window.fetch = function (input, init) {
      const promise = nativeFetch.apply(this, arguments);
      try {
        const url = String(typeof input === 'string' ? input : input && input.url || '');
        if (LOCAL.test(url)) {
          const method = String(init && init.method || (input && input.method) || 'GET').toUpperCase();
          let body = '';
          try { body = typeof (init && init.body) === 'string' ? init.body.slice(0, 300) : ''; } catch (_) {}
          promise.then(response => {
            try {
              response.clone().text().then(text => report({kind: 'fetch', url, method, body, status: response.status, size: text.length, snippet: snippetOf(text)})).catch(() => {});
            } catch (_) {}
          }).catch(() => {});
        }
      } catch (_) {}
      return promise;
    };
  } catch (_) {}

  try {
    const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (proto && proto.open && proto.send) {
      const nativeOpen = proto.open, nativeSend = proto.send;
      proto.open = function (method, url) {
        try {
          if (LOCAL.test(String(url || ''))) {
            this.__ordTapUrl = String(url);
            this.__ordTapMethod = String(method || 'GET').toUpperCase();
          }
        } catch (_) {}
        return nativeOpen.apply(this, arguments);
      };
      proto.send = function (body) {
        try {
          if (this.__ordTapUrl) {
            const xhr = this, tapBody = typeof body === 'string' ? String(body).slice(0, 300) : '';
            xhr.addEventListener('load', function () {
              try {
                let text = '';
                try { text = typeof xhr.responseText === 'string' ? xhr.responseText : ''; } catch (_) {}
                report({kind: 'xhr', url: xhr.__ordTapUrl, method: xhr.__ordTapMethod, body: tapBody, status: xhr.status, size: text.length, snippet: snippetOf(text)});
              } catch (_) {}
            });
          }
        } catch (_) {}
        return nativeSend.apply(this, arguments);
      };
    }
  } catch (_) {}
})();
