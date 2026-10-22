/* demo.js - Interactive product demo for Bunty hero section
   Handles tab switching between format (Chat vs Call) and languages (English, Hinglish, Gujarati).
   Works statically without JS; this script progressively enhances tabs. */

(function () {
  'use strict';

  var demoContainer = document.querySelector('.demo');
  if (!demoContainer) return;

  var currentMode = 'chat';
  var currentLang = 'en';

  var modeTabs = demoContainer.querySelectorAll('[data-demo-mode]');
  var langTabs = demoContainer.querySelectorAll('[data-demo-lang]');
  var conversations = demoContainer.querySelectorAll('.demo__conversation');

  function updateActivePanel() {
    conversations.forEach(function (panel) {
      var panelMode = panel.getAttribute('data-demo-mode');
      var panelLang = panel.getAttribute('data-demo-lang');
      var isMatch = (panelMode === currentMode && panelLang === currentLang);

      if (isMatch) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', '');
      }
    });

    modeTabs.forEach(function (tab) {
      if (tab.classList.contains('demo__tab')) {
        var mode = tab.getAttribute('data-demo-mode');
        var isActive = mode === currentMode;
        tab.classList.toggle('demo__tab--active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
      }
    });

    langTabs.forEach(function (tab) {
      if (tab.classList.contains('demo__lang-tab')) {
        var lang = tab.getAttribute('data-demo-lang');
        var isActive = lang === currentLang;
        tab.classList.toggle('demo__lang-tab--active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
      }
    });
  }

  modeTabs.forEach(function (tab) {
    if (tab.classList.contains('demo__tab')) {
      tab.addEventListener('click', function () {
        var mode = tab.getAttribute('data-demo-mode');
        if (mode) {
          currentMode = mode;
          updateActivePanel();
        }
      });
    }
  });

  langTabs.forEach(function (tab) {
    if (tab.classList.contains('demo__lang-tab')) {
      tab.addEventListener('click', function () {
        var lang = tab.getAttribute('data-demo-lang');
        if (lang) {
          currentLang = lang;
          updateActivePanel();
        }
      });
    }
  });

  // Initial update
  updateActivePanel();
})();
