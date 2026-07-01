(function () {
  var chartCol = document.querySelector('.home-col-chart');
  var leftCol = document.querySelector('.home-col-left');
  var metricsCol = document.querySelector('.home-col-metrics');

  if (chartCol && leftCol) {
    var focusPanels = leftCol.querySelectorAll('.home-panel-popular, .home-panel-groups');

    chartCol.addEventListener('mouseenter', function () {
      chartCol.classList.add('is-elevated');
      chartCol.classList.remove('is-receded');
      focusPanels.forEach(function (p) { p.classList.remove('is-focus'); });
      if (metricsCol) metricsCol.classList.remove('is-focus');
    });

    chartCol.addEventListener('mouseleave', function () {
      chartCol.classList.remove('is-elevated');
    });

    function bindRecede(el) {
      if (!el) return;
      el.addEventListener('mouseenter', function () {
        if (!chartCol.classList.contains('is-elevated')) {
          chartCol.classList.add('is-receded');
          el.classList.add('is-focus');
        }
      });
      el.addEventListener('mouseleave', function () {
        chartCol.classList.remove('is-receded');
        el.classList.remove('is-focus');
      });
    }

    focusPanels.forEach(bindRecede);
    bindRecede(metricsCol);
  }

  document.querySelectorAll('.group-fan-stack').forEach(function (stack) {
    stack.addEventListener('click', function (e) {
      if (window.matchMedia('(hover: hover)').matches) return;
      e.stopPropagation();
      stack.classList.toggle('is-open');
    });
  });

  document.addEventListener('click', function () {
    if (!window.matchMedia('(hover: hover)').matches) {
      document.querySelectorAll('.group-fan-stack.is-open').forEach(function (s) {
        s.classList.remove('is-open');
      });
    }
  });
})();
