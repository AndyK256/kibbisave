package com.kibbisave.app

import java.math.BigDecimal
import java.net.URI

/** Business rules without Android dependencies, exercised by JVM tests. */
object OfflinePolicy {
    const val MAX_AGE_MS = 24L * 60 * 60 * 1000
    private val allowed = setOf("/api/home", "/api/groups/mine", "/api/profile/history")
    fun maySave(path: String, admin: Boolean): Boolean = !admin && path in allowed
    fun mayRead(path: String, admin: Boolean, savedAt: Long, sessionExpires: Long, now: Long): Boolean =
        maySave(path, admin) && now < sessionExpires && savedAt <= now && now - savedAt <= MAX_AGE_MS
}

object Money {
    fun positiveUgx(raw: String): Long? = try {
        val amount = BigDecimal(raw.trim())
        if (amount.stripTrailingZeros().scale() > 0) null
        else amount.longValueExact().takeIf { it in 1..1_000_000_000_000L }
    } catch (_: NumberFormatException) { null } catch (_: ArithmeticException) { null }
}

object ApiAddress {
    fun resolve(origin: String, path: String): URI {
        val base = URI(origin)
        require(base.scheme == "https" && base.host != null && base.rawUserInfo == null &&
            base.port == -1 && base.rawQuery == null && base.rawFragment == null &&
            base.path.orEmpty().trim('/').isEmpty()) { "Invalid API origin" }
        require(path.startsWith("/api/") && !path.contains('\\') && !path.contains('#')) { "Invalid API path" }
        val destination = URI(base.toString().trimEnd('/') + path)
        require(destination.scheme == base.scheme && destination.host == base.host &&
            destination.normalize().path.startsWith("/api/") &&
            !destination.rawPath.contains('%')) { "Invalid API path" }
        return destination
    }
}
