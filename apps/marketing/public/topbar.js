/**
 * OpalSwift shared topbar
 * Each skin page sets: window.OPAL_SKIN = { he: "לצלמים", en: "for Photographers" }
 * Then includes: <nav id="opal-nav"></nav>  +  <script src="topbar.js"></script>
 *
 * Language contract:
 *   - Reads/writes localStorage key 'os_lang'
 *   - applyLang() is called after nav is injected, so buttons always exist
 *   - window.setLang() is exposed globally for button onclick handlers
 */
(function () {
  /* ── helpers ────────────────────────────────────────────── */
  function getSavedLang() {
    var saved = null;
    try {
      saved = localStorage.getItem('os_lang');
      /* migrate from old hyphen key that may still be in user's browser */
      if (!saved) {
        var old = localStorage.getItem('os-lang');
        if (old === 'he' || old === 'en') {
          saved = old;
          localStorage.setItem('os_lang', old);
          try { localStorage.removeItem('os-lang'); } catch (e) {}
        }
      }
    } catch (e) {}
    if (saved === 'he' || saved === 'en') return saved;
    var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    return nav.startsWith('en') ? 'en' : 'he';
  }

  function applyLang(lang) {
    var isHe = lang === 'he';
    try { localStorage.setItem('os_lang', lang); } catch (e) {}
    document.documentElement.lang = lang;
    document.documentElement.dir = isHe ? 'rtl' : 'ltr';
    if (document.body) {
      document.body.dir  = isHe ? 'rtl' : 'ltr';
      document.body.lang = lang;
    }
    var btnHe = document.getElementById('btn-he');
    var btnEn = document.getElementById('btn-en');
    if (btnHe) btnHe.classList.toggle('active', isHe);
    if (btnEn) btnEn.classList.toggle('active', !isHe);
    document.querySelectorAll('[data-he]').forEach(function (el) {
      var val = isHe ? el.getAttribute('data-he') : el.getAttribute('data-en');
      if (val !== null) el.innerHTML = val;
    });
  }

  /* expose globally so onclick="setLang('en',true)" works on every page */
  window.setLang = function (lang, remember) {
    applyLang(lang);
  };

  /* ── nav HTML ───────────────────────────────────────────── */
  var skin = window.OPAL_SKIN || null;
  /* page name for the beta form's "from" hint, e.g. art-class */
  var page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '').replace(/[^a-z0-9-]/gi, '') || 'site';
  var subHTML = skin
    ? '<span class="sub" data-he="' + skin.he + '" data-en="' + skin.en + '">' + skin.he + '</span>'
    : '';

  var html =
    '<div class="wrap nav-in">' +
    '  <a class="logo" href="index.html">' +
    '    <img src="opalswift_color_final.svg" class="gem" alt="OpalSwift logo">' +
    '    OpalSwift' + subHTML +
    '  </a>' +
    '  <div class="nav-cta">' +
    '    <div class="lang-toggle">' +
    '      <button id="btn-he" onclick="setLang(\'he\')">עברית</button>' +
    '      <button id="btn-en" onclick="setLang(\'en\')">EN</button>' +
    '    </div>' +
    '    <a href="https://app.opalswift.com" class="nav-signin" data-he="כניסה" data-en="Sign in">כניסה</a>' +
    '    <a href="index.html?from=' + page + '#contact" class="btn btn-primary" style="padding:10px 20px"' +
    '       data-he="הצטרפו לבטא החינמית" data-en="Join the free beta">הצטרפו לבטא החינמית</a>' +
    '  </div>' +
    '</div>';

  /* ── favicon ────────────────────────────────────────────── */
  function injectFavicon() {
    if (document.querySelector('link[rel~="icon"]')) return; /* already set */
    var link = document.createElement('link');
    link.rel  = 'icon';
    link.type = 'image/png';
    link.href = 'favicon-64.png';
    document.head.appendChild(link);
  }

  /* ── CSS ────────────────────────────────────────────────── */
  var styleTag = document.createElement('style');
  styleTag.textContent = [
    'html,body{overflow-x:hidden;max-width:100%}',
    '*{box-sizing:border-box}',
    '.logo .gem{width:30px;height:30px;display:inline-block;vertical-align:middle}',
    '.nav-cta{display:flex;align-items:center;gap:12px}',
    /* hide the ACTIVE language button; show only the opposite one */
    '.lang-toggle button.active{display:none}',
    '.lang-toggle button{display:inline-block}',
    '.nav-signin{color:inherit;opacity:.8;text-decoration:none;font-size:15px;font-weight:600;white-space:nowrap}',
    '.nav-signin:hover{opacity:1}',
    '@media(max-width:640px){',
    '  html,body{overflow-x:hidden}',
    '  .nav-in{height:58px}',
    '  .logo .sub{display:none}',
    '  .lang-toggle button{padding:5px 9px;font-size:11px}',
    '  .lang-toggle{border-radius:8px}',
    '  .nav-cta .btn{padding:8px 14px;font-size:13px;white-space:nowrap}',
    '  .nav-signin{font-size:13px}',
    '  .back-bar{padding:14px 0 0}',
    '  .back-link{font-size:13px}',
    '}',
    '@media(max-width:480px){',
    '  #opal-nav .nav-in{gap:8px;padding:0 16px}',
    '  .nav-cta{gap:8px}',
    '  .nav-cta .btn{padding:7px 10px!important;font-size:12px}',
    '  .nav-signin{font-size:12px}',
    '  .logo{font-size:18px}',
    '}'
  ].join('\n');
  document.head.appendChild(styleTag);

  /* ── inject ─────────────────────────────────────────────── */
  function inject() {
    var nav = document.getElementById('opal-nav');
    if (nav) { nav.innerHTML = html; }
    injectFavicon();
    /* Apply saved (or browser-detected) language NOW that buttons exist */
    applyLang(getSavedLang());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
