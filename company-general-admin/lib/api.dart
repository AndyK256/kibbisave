import 'dart:convert';
import 'dart:io';

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
      request.cookies.add(Cookie('kibbi_company_token', _session!));
    }
    if (body != null) request.write(jsonEncode(body));
    final response = await request.close().timeout(const Duration(seconds: 30));
    for (final cookie in response.cookies) {
      if (cookie.name == 'kibbi_company_token' &&
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

  Future<void> loginWithAccessCode(String code) async {
    await request(
      '/api/internal/access-code',
      method: 'POST',
      body: {'code': code},
    );
  }

  Future<void> logout() async {
    final oldSession = _session;
    clearSession();
    // Clear locally first; a failed remote call must never trap the user.
    if (oldSession == null) return;
    try {
      final req = await _client.postUrl(origin.resolve('/api/internal/access-code/logout'));
      req.cookies.add(Cookie('kibbi_company_token', oldSession));
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
