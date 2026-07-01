(function () {
  var OTHER_PERIODS = ['18m', '24m', '36m', '48m', '60m'];
  var activePeriod = 'all';
  var activeOtherPeriod = null;

  function currentTab() {
    var inner = document.getElementById('swipeInner');
    return inner && inner.classList.contains('show-private') ? 'private' : 'public';
  }

  function matchesPeriod(secPeriod) {
    if (activePeriod === 'all') return true;
    if (activePeriod === 'others') {
      if (activeOtherPeriod) return secPeriod === activeOtherPeriod;
      return OTHER_PERIODS.indexOf(secPeriod) !== -1;
    }
    return secPeriod === activePeriod;
  }

  function applyFilter() {
    var tab = currentTab();
    var sections = document.querySelectorAll('.range-sec[data-group]');
    var visible = 0;

    sections.forEach(function (sec) {
      var show = sec.dataset.type === tab && matchesPeriod(sec.dataset.period);
      sec.classList.toggle('filtered-out', !show);
      if (show) visible += 1;
    });

    var emptyPublic = document.getElementById('groupsEmpty');
    var emptyPrivate = document.getElementById('groupsEmptyPrivate');
    if (emptyPublic) emptyPublic.classList.toggle('show', tab === 'public' && visible === 0);
    if (emptyPrivate) emptyPrivate.classList.toggle('show', tab === 'private' && visible === 0);
  }

  window.setDuration = function (period, el) {
    activePeriod = period;
    activeOtherPeriod = null;

    document.querySelectorAll('.dur-pill').forEach(function (p) {
      p.classList.remove('act');
    });
    document.querySelectorAll('.dur-other-pill').forEach(function (p) {
      p.classList.remove('act');
    });
    if (el) el.classList.add('act');

    var sub = document.getElementById('durOthersSub');
    if (sub) sub.classList.toggle('show', period === 'others');

    applyFilter();
  };

  window.setOtherDuration = function (period, el) {
    activePeriod = 'others';
    activeOtherPeriod = period;

    document.querySelectorAll('.dur-pill').forEach(function (p) {
      p.classList.remove('act');
    });
    document.querySelectorAll('.dur-other-pill').forEach(function (p) {
      p.classList.remove('act');
    });

    var othersBtn = document.getElementById('durPillOthers');
    if (othersBtn) othersBtn.classList.add('act');
    if (el) el.classList.add('act');

    var sub = document.getElementById('durOthersSub');
    if (sub) sub.classList.add('show');

    applyFilter();
  };

  var origSwitchTab = window.switchTab;
  window.switchTab = function (tab) {
    if (origSwitchTab) origSwitchTab(tab);
    applyFilter();
  };

  applyFilter();
})();
