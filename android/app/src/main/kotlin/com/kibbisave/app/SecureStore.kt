package com.kibbisave.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

/** Encrypts session cookies and snapshots with an app-specific Android Keystore key. */
class SecureStore(context: Context) {
    private val prefs = context.getSharedPreferences("native_vault", Context.MODE_PRIVATE)
    private val alias = context.packageName + ".native.v1"
    private val aad = (context.packageName + "|" + BuildConfig.API_URL).toByteArray(Charsets.UTF_8)
    private var state = read()

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let {
            return it
        }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            .apply {
                init(
                    KeyGenParameterSpec.Builder(
                            alias,
                            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                        )
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .build()
                )
            }
            .generateKey()
    }

    private fun read(): JSONObject =
        try {
            val payload = prefs.getString("payload", null)
            if (payload == null) JSONObject()
            else {
                val parts = payload.split(':')
                require(parts.size == 2)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(
                    Cipher.DECRYPT_MODE,
                    key(),
                    GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)),
                )
                cipher.updateAAD(aad)
                JSONObject(
                    String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8)
                )
            }
        } catch (_: Exception) {
            prefs.edit().clear().commit()
            try {
                KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(alias)
            } catch (_: Exception) {}
            JSONObject()
        }

    private fun persist() {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(aad)
        val data = cipher.doFinal(state.toString().toByteArray(Charsets.UTF_8))
        check(
            prefs
                .edit()
                .putString(
                    "payload",
                    Base64.encodeToString(cipher.iv, Base64.NO_WRAP) +
                        ":" +
                        Base64.encodeToString(data, Base64.NO_WRAP),
                )
                .commit()
        ) {
            "Could not save the secure session"
        }
    }

    @Synchronized
    fun session(): Session? {
        val value = state.optJSONObject("session") ?: return null
        val session =
            Session(
                value.optString("id"),
                value.optString("name"),
                value.optString("cookie"),
                value.optLong("expires"),
            )
        if (
            session.id.isBlank() ||
                session.cookie.isBlank() ||
                session.expires <= System.currentTimeMillis()
        ) {
            clear()
            return null
        }
        return session
    }

    @Synchronized
    fun saveSession(session: Session) {
        state =
            JSONObject()
                .put(
                    "session",
                    JSONObject()
                        .put("id", session.id)
                        .put("name", session.name)
                        .put("cookie", session.cookie)
                        .put("expires", session.expires),
                )
        persist()
    }

    /** Refresh account details without discarding an unresolved payment reminder. */
    @Synchronized
    fun refreshSession(session: Session) {
        check(state.optJSONObject("session")?.optString("id") == session.id) {
            "Account changed. Sign in again."
        }
        state.put(
            "session",
            JSONObject()
                .put("id", session.id)
                .put("name", session.name)
                .put("cookie", session.cookie)
                .put("expires", session.expires),
        )
        persist()
    }

    @Synchronized
    fun saveSnapshot(path: String, data: JSONObject) {
        val session = session() ?: return
        if (!OfflinePolicy.maySave(path, BuildConfig.ADMIN_APP)) return
        val snapshots = state.optJSONObject("snapshots") ?: JSONObject()
        snapshots.put(
            path,
            JSONObject()
                .put("account", session.id)
                .put("savedAt", System.currentTimeMillis())
                .put("data", data),
        )
        state.put("snapshots", snapshots)
        persist()
    }

    @Synchronized
    fun snapshot(path: String): Snapshot? {
        val session = session() ?: return null
        val saved = state.optJSONObject("snapshots")?.optJSONObject(path) ?: return null
        val savedAt = saved.optLong("savedAt")
        if (
            saved.optString("account") != session.id ||
                !OfflinePolicy.mayRead(
                    path,
                    BuildConfig.ADMIN_APP,
                    savedAt,
                    session.expires,
                    System.currentTimeMillis(),
                )
        )
            return null
        return Snapshot(saved.getJSONObject("data"), savedAt, true)
    }

    @Synchronized
    fun clearSnapshots() {
        state.remove("snapshots")
        persist()
    }

    @Synchronized
    fun pendingWrite(): String? = state.optString("pendingWrite").takeIf { it.isNotBlank() }

    @Synchronized
    fun beginWrite(path: String) {
        check(pendingWrite() == null) {
            "Check the previous request before sending another payment action."
        }
        state.put("pendingWrite", path)
        persist()
    }

    @Synchronized
    fun resolveWrite() {
        state.remove("pendingWrite")
        persist()
    }

    @Synchronized
    fun clear() {
        state = JSONObject()
        check(prefs.edit().clear().commit()) { "Could not clear the local session" }
    }
}

data class Session(val id: String, val name: String, val cookie: String, val expires: Long)

data class Snapshot(val data: JSONObject, val savedAt: Long, val offline: Boolean)
