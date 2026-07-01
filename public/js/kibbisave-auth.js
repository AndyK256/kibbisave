(function () {
  var params = new URLSearchParams(window.location.search);
  var error = params.get('error');
  if (!error) return;

  var el = document.getElementById('auth-error');
  if (!el) return;

  var messages = {
    access_denied: 'Sign-in was cancelled.',
    missing_code: 'Google did not return an authorization code.',
    token_exchange_failed: 'Could not complete Google sign-in. Please try again later.',
    profile_failed: 'Could not load your Google profile.',
    not_configured: 'Google sign-in is not configured on the server.',
    server_error: 'Something went wrong. Please try again.',
  };

  el.textContent = messages[error] || 'Sign-in failed. Please try again.';
  el.classList.add('show');
})();
