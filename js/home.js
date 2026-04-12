(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined' || !window.GW || !window.GW.HomePage) return;

  document.addEventListener('DOMContentLoaded', function () {
    window.GW.HomePage.init();
  });
})();
