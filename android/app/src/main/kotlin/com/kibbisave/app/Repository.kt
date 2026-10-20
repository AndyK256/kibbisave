package com.kibbisave.app

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

class Repository(private val store: SecureStore) {
    private val api = ApiClient(store)

    fun login(identifier: String, password: String): Session {
        val path = if (BuildConfig.ADMIN_APP) "/api/admin/login" else "/api/auth/login"
        val result = api.request(path, JSONObject().put("identifier", identifier).put("password", password), false)
        return establishSession(result)
    }

    fun googleChallenge(): JSONObject = api.request(
        "/api/auth/google/native/challenge?audience=" + if (BuildConfig.ADMIN_APP) "admin" else "user",
        authenticated = false
    ).body

    fun googleLogin(idToken: String, challenge: String): Session = establishSession(api.request(
        "/api/auth/google/native", JSONObject().put("idToken", idToken).put("challenge", challenge), false
    ))

    private fun establishSession(result: ApiReply): Session {
        if (!result.body.optBoolean("success")) throw ApiException(401, "Sign-in was not confirmed.")
        val user = result.body.optJSONObject("user") ?: throw ApiException(502, "No account was returned.")
        val id = user.optString("id").ifBlank { user.optString("userId") }
        val cookie = result.sessionCookie
        if (id.isBlank() || cookie.isNullOrBlank()) throw ApiException(502, "The API did not establish a session.")
        if (BuildConfig.ADMIN_APP && !result.body.optBoolean("kycComplete")) {
            throw ApiException(403, "Complete admin verification and PIN setup on the admin website first.")
        }
        val session = Session(id, user.optString("name", "Member"), cookie, result.expires)
        store.saveSession(session)
        return session
    }

    fun publicLoad(path: String): Snapshot {
        try {
            val signedIn = store.session() != null
            val data = api.request(path, authenticated = signedIn).body
            if (signedIn && data.has("authenticated") && !data.optBoolean("authenticated")) {
                throw ApiException(401, "Your session has expired. Sign in again.")
            }
            if (data.has("error") || data.has("notice")) throw ApiException(503, data.optString("error", data.optString("notice")))
            return Snapshot(data, System.currentTimeMillis(), false)
        } catch (error: ApiException) {
            if (error.status == 401) store.clear()
            if (error.status == 403) store.clearSnapshots()
            throw error
        }
    }

    fun register(body: JSONObject): Session = establishSession(api.request(
        if (BuildConfig.ADMIN_APP) "/api/admin/register" else "/api/auth/register", body, false))

    fun change(path: String, body: JSONObject, method: String = "POST"): JSONObject {
        if (store.session() == null) throw ApiException(401, "Sign in to continue.")
        val reply = api.request(path, body, method = method)
        if (!reply.body.optBoolean("success")) throw ApiException(502, "The server did not confirm this action.")
        reply.sessionCookie?.let { cookie -> store.session()?.let { store.refreshSession(it.copy(cookie = cookie, expires = reply.expires)) } }
        store.clearSnapshots()
        return reply.body
    }

    fun load(path: String): Snapshot {
        if (store.session() == null) throw ApiException(401, "Sign in to continue.")
        try {
            val result = api.request(path).body
            if (result.has("authenticated") && !result.optBoolean("authenticated")) {
                throw ApiException(401, "Your session has expired. Sign in again.")
            }
            if (result.has("error") || result.has("notice")) {
                throw ApiException(503, result.optString("error").ifBlank { result.optString("notice", "Data is unavailable.") }.take(220))
            }
            val required = when (path) {
                "/api/home" -> "summary"
                "/api/groups/mine" -> "groups"
                "/api/profile/history" -> "history"
                "/api/admin/home" -> "totalCollected"
                "/api/admin/communities" -> "communities"
                "/api/admin/transactions" -> "transactions"
                "/api/admin/approvals" -> "requests"
                else -> null
            }
            if (required != null && !result.has(required)) throw ApiException(502, "The API response does not match this app version.")
            val safe = when (path) {
                "/api/home" -> JSONObject().put("summary", result.optJSONObject("summary") ?: JSONObject())
                    .put("my_groups", result.optJSONArray("my_groups") ?: JSONArray())
                "/api/groups/mine" -> JSONObject().put("groups", result.optJSONArray("groups") ?: JSONArray())
                "/api/profile/history" -> JSONObject().put("history", result.optJSONArray("history") ?: JSONArray())
                else -> result
            }
            if (OfflinePolicy.maySave(path, BuildConfig.ADMIN_APP)) {
                try { store.saveSnapshot(path, safe) } catch (_: Exception) { }
            }
            return Snapshot(result, System.currentTimeMillis(), false)
        } catch (error: ApiException) {
            if (error.status == 401) store.clear()
            if (error.status == 403) store.clearSnapshots()
            throw error
        } catch (error: IOException) {
            return store.snapshot(path) ?: throw error
        }
    }

    fun post(path: String, body: JSONObject): JSONObject {
        if (store.session() == null) throw ApiException(401, "Sign in to continue.")
        val financial = FinancialPolicy.requiresConfirmation(path)
        if (financial) store.beginWrite(path)
        try {
            val result = api.request(path, body).body
            if (!result.optBoolean("success")) throw ApiException(502, "The server did not confirm this action.")
            if (financial) store.resolveWrite()
            // Invalidate balances only after server confirmation; a storage error must not suggest resubmission.
            try { store.clearSnapshots() } catch (_: Exception) { }
            return result
        } catch (error: ApiException) {
            if (error.status == 401) store.clear()
            if (financial && error.status == 403) store.resolveWrite()
            throw error
        }
    }

    fun logout() {
        try { api.request("/api/auth/logout", JSONObject()) } finally { store.clear() }
    }
}
