/**
 * OpalSwift shared topbar
 * Each skin page sets: window.OPAL_SKIN = { he: "לצלמים", en: "for Photographers" }
 * Then includes: <nav id="opal-nav"></nav>  +  <script src="topbar.js"></script>
 *
 * Language contract:
 *   - English by default; Hebrew when the browser's first language is Hebrew
 *   - A language the visitor picks with the button is kept in localStorage 'os_lang_choice'
 *     and wins on every page. The detected language is never saved.
 *   - applyLang() is called after nav is injected, so buttons always exist
 *   - window.setLang() is exposed globally for button onclick handlers
 */
(function () {
  /* ── helpers ────────────────────────────────────────────── */
  /* English unless the browser's first language is Hebrew ('iw' is the old code). */
  function browserLang() {
    var l = ((navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage || '').toLowerCase();
    return (l.indexOf('he') === 0 || l.indexOf('iw') === 0) ? 'he' : 'en';
  }

  function getSavedLang() {
    var saved = null;
    try {
      saved = localStorage.getItem('os_lang_choice');
      /* The old keys also held auto-detected values, so they are not a choice: drop them. */
      localStorage.removeItem('os_lang');
      localStorage.removeItem('os-lang');
    } catch (e) {}
    if (saved === 'he' || saved === 'en') return saved;
    return browserLang();
  }

  function applyLang(lang) {
    var isHe = lang === 'he';
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
    // The search description follows the page language too (build-seo.mjs writes both).
    var desc = document.querySelector('meta[name="description"]');
    var d = desc && desc.getAttribute(isHe ? 'data-he-content' : 'data-en-content');
    if (d) desc.setAttribute('content', d);
  }

  /* expose globally so onclick="setLang('en',true)" works on every page */
  window.setLang = function (lang, remember) {
    applyLang(lang);
    if (remember) { try { localStorage.setItem('os_lang_choice', lang); } catch (e) {} }
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
    '      <button id="btn-he" onclick="setLang(\'he\', true)">עברית</button>' +
    '      <button id="btn-en" onclick="setLang(\'en\', true)">EN</button>' +
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
