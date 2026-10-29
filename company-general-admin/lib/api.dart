import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:crypto/crypto.dart';

typedef Json = Map<String, dynamic>;

class ApiException implements Exception {
  final String message;
  final int status;
  const ApiException(this.message, this.status);
  @override
  String toString() => message;
}

/// Uses the website's existing session and tenant-scoped endpoints.
/// Session cookies stay in memory and are discarded on logout or app exit.
class CompanyApi {
  final Uri origin;
  final HttpClient _client = HttpClient();
  String? _session;
  int _sessionGeneration = 0;
  void clearSession() {
    _sessionGeneration++;
    _session = null;
  }

  CompanyApi({
    String baseUrl = const String.fromEnvironment(
      'KIBBI_API_URL',
      defaultValue: 'https://kibbisave.com',
    ),
  }) : origin = Uri.parse(baseUrl) {
    if (origin.scheme != 'https' ||
        origin.host.isEmpty ||
        origin.userInfo.isNotEmpty ||
        origin.hasQuery ||
        origin.hasFragment ||
        !['', '/'].contains(origin.path)) {
      throw ArgumentError(
        'Use an HTTPS API origin without credentials or a path.',
      );
    }
    _client.connectionTimeout = const Duration(seconds: 20);
  }
  Future<Json> request(String path, {String method = 'GET', Json? body}) async {
    final generation = _sessionGeneration;
    final uri = origin.resolve(path);
    if (uri.origin != origin.origin || !path.startsWith('/api/')) {
      throw ArgumentError('Invalid API path');
    }
    final request = await _client.openUrl(method, uri);
    request.followRedirects = false;
    request.headers.contentType = ContentType.json;
    if (_session != null) {
      request.cookies.add(Cookie('kibbisave_token', _session!));
    }
    if (body != null) request.write(jsonEncode(body));
    final response = await request.close().timeout(const Duration(seconds: 30));
    for (final cookie in response.cookies) {
      if (cookie.name == 'kibbisave_token' &&
          generation == _sessionGeneration) {
        _session = cookie.value.isEmpty ? null : cookie.value;
      }
    }
    final text = await utf8.decoder.bind(response).join();
    Json data;
    try {
      data = jsonDecode(text) as Json;
    } catch (_) {
      throw ApiException(
        'The server did not return application data.',
        response.statusCode,
      );
    }
    if (response.statusCode >= 400) {
      if (response.statusCode == 401 && generation == _sessionGeneration) {
        _session = null;
      }
      throw ApiException(
        data['error']?.toString() ?? 'Request failed. Please retry.',
        response.statusCode,
      );
    }
    return data;
  }

  Future<void> login(String identifier, String password) async {
    await request(
      '/api/auth/login',
      method: 'POST',
      body: {'identifier': identifier, 'password': password},
    );
  }

  Future<DesktopLoginAttempt> beginDesktopLogin() async {
    final random = Random.secure();
    final verifier = base64UrlEncode(
      List<int>.generate(32, (_) => random.nextInt(256)),
    ).replaceAll('=', '');
    final challenge = base64UrlEncode(
      sha256.convert(utf8.encode(verifier)).bytes,
    ).replaceAll('=', '');
    final data = await request(
      '/api/auth/desktop/start',
      method: 'POST',
      body: {'challenge': challenge},
    );
    final url = Uri.parse(data['browserUrl'] as String);
    if (url.origin != origin.origin || url.path != '/desktop-sign-in.html') {
      throw const ApiException('Invalid sign-in destination.', 502);
    }
    return DesktopLoginAttempt(
      this,
      data['requestId'] as String,
      verifier,
      data['displayCode'] as String,
      url,
    );
  }

  Future<void> logout() async {
    final oldSession = _session;
    clearSession();
    // Clear locally first; a failed remote call must never trap the user.
    if (oldSession == null) return;
    try {
      final req = await _client.postUrl(origin.resolve('/api/auth/logout'));
      req.cookies.add(Cookie('kibbisave_token', oldSession));
      await (await req.close()).drain<void>().timeout(
        const Duration(seconds: 5),
      );
    } catch (_) {
      /* Local session has already been removed. */
    }
  }

  void close() {
    clearSession();
    _client.close(force: true);
  }
}

class DesktopLoginAttempt {
  final CompanyApi api;
  final String requestId, verifier, displayCode;
  final Uri browserUrl;
  bool cancelled = false;
  DesktopLoginAttempt(
    this.api,
    this.requestId,
    this.verifier,
    this.displayCode,
    this.browserUrl,
  );
  Future<bool> poll() async {
    if (cancelled) return false;
    final data = await api.request(
      '/api/auth/desktop/exchange',
      method: 'POST',
      body: {'requestId': requestId, 'verifier': verifier},
    );
    return !cancelled && data['success'] == true;
  }

  Future<void> cancel() async {
    cancelled = true;
    api.clearSession();
    try {
      await api.request(
        '/api/auth/desktop/cancel',
        method: 'POST',
        body: {'requestId': requestId, 'verifier': verifier},
      );
    } catch (_) {}
  }
}
