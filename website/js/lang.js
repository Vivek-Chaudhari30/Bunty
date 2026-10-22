/* lang.js - Language switcher for Bunty website
   Loads translation JSON files and swaps text content for elements with data-i18n attributes.
   English is loaded by default in the HTML (no-JS safe). */

(function () {
  'use strict';

  var currentLang = 'en';
  var translations = {};

  var buttons = document.querySelectorAll('.lang-switcher__btn');
  if (!buttons.length) return;

  function getNestedValue(obj, path) {
    var parts = path.split('.');
    var current = obj;
    for (var i = 0; i < parts.length; i++) {
      if (!current || typeof current !== 'object') return null;
      current = current[parts[i]];
    }
    return current;
  }

  function applyTranslations(lang, data) {
    var elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var val = getNestedValue(data, key);
      if (val !== null && val !== undefined) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.setAttribute('placeholder', val);
        } else {
          el.textContent = val;
        }
      }
    });

    document.documentElement.setAttribute('lang', lang);

    buttons.forEach(function (btn) {
      var isActive = btn.getAttribute('data-lang') === lang;
      btn.classList.toggle('lang-switcher__btn--active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });

    currentLang = lang;
  }

  function setLanguage(lang) {
    if (lang === currentLang && translations[lang]) return;

    if (translations[lang]) {
      applyTranslations(lang, translations[lang]);
      return;
    }

    var url = 'content/' + lang + '.json';
    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('Translation not found');
        return res.json();
      })
      .then(function (data) {
        translations[lang] = data;
        applyTranslations(lang, data);
      })
      .catch(function (err) {
        console.error('Could not load language: ' + lang, err);
      });
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetLang = btn.getAttribute('data-lang');
      if (targetLang) {
        setLanguage(targetLang);
      }
    });
  });
})();
