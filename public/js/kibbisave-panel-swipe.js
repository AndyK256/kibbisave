// KibbiSave — live-drag horizontal panel swipe (Groups-style)
(function (global) {
  function attachPanelSwipe(opts) {
    var viewport = opts.viewport;
    var track = opts.track;
    var hint = opts.hint || null;
    var labelNext = opts.labelNext || 'Messages';
    var labelPrev = opts.labelPrev || 'Standings';
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};
    var active = opts.initialIndex === 1 ? 1 : 0;

    function updateHint() {
      if (!hint) return;
      hint.innerHTML = active === 0
        ? '<span>Swipe for ' + labelNext + '</span><span class="arrow">››</span>'
        : '<span class="arrow">‹‹</span><span>Swipe for ' + labelPrev + '</span>';
    }

    function snapTo(index, flags) {
      flags = flags || {};
      active = index === 1 ? 1 : 0;
      if (!track) return;
      track.classList.remove('is-dragging');
      track.style.width = '200%';
      track.style.display = 'flex';
      if (flags.instant) {
        track.style.transition = 'none';
        track.style.transform = 'translateX(' + (active * -50) + '%)';
        void track.offsetWidth;
        track.style.transition = '';
      } else {
        track.style.transition = '';
        track.style.transform = 'translateX(' + (active * -50) + '%)';
      }
      updateHint();
      if (!flags.silent) onChange(active, flags);
    }

    function getIndex() { return active; }

    if (viewport && track) {
      var startX = 0;
      var startY = 0;
      var dx = 0;
      var dragging = false;
      var axis = null;

      function basePct() { return active * -50; }

      viewport.addEventListener('touchstart', function (e) {
        if (!e.touches || !e.touches.length) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dx = 0;
        dragging = true;
        axis = null;
      }, { passive: true });

      viewport.addEventListener('touchmove', function (e) {
        if (!dragging || !e.touches || !e.touches.length) return;
        var x = e.touches[0].clientX - startX;
        var y = e.touches[0].clientY - startY;
        if (!axis) {
          if (Math.abs(x) < 8 && Math.abs(y) < 8) return;
          axis = Math.abs(x) > Math.abs(y) ? 'x' : 'y';
          if (axis === 'x') track.classList.add('is-dragging');
        }
        if (axis !== 'x') return;
        dx = x;
        var w = viewport.offsetWidth || 1;
        var pct = basePct() + (dx / w) * 50;
        if (pct > 8) pct = 8;
        if (pct < -50 - 8) pct = -50 - 8;
        track.style.transform = 'translateX(' + pct + '%)';
      }, { passive: true });

      function endDrag() {
        if (!dragging) return;
        dragging = false;
        track.classList.remove('is-dragging');
        var w = viewport.offsetWidth || 1;
        if (axis === 'x' && Math.abs(dx) > w * 0.18) {
          if (dx < 0) snapTo(1);
          else snapTo(0);
        } else {
          snapTo(active, { silent: true });
          track.style.transform = 'translateX(' + (active * -50) + '%)';
        }
        dx = 0;
        axis = null;
      }
      viewport.addEventListener('touchend', endDrag);
      viewport.addEventListener('touchcancel', endDrag);
    }

    updateHint();
    snapTo(active, { instant: true, silent: true });

    return { snapTo: snapTo, getIndex: getIndex, updateHint: updateHint };
  }

  global.KibbiAttachPanelSwipe = attachPanelSwipe;
})(typeof window !== 'undefined' ? window : this);
